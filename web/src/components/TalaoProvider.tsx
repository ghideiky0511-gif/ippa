'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CartItem, OrderSession, ShippingOption } from '@/lib/types';

interface TalaoContextValue {
  sessions: OrderSession[]; // todas (aberta + fechada) — usado por "buscar existentes"
  openSessions: OrderSession[]; // status 'aberto' OU 'aguardando_pagamento' — o que aparece no painel do talão
  activeSession: OrderSession | null;
  activeSessionId: string | null;
  isTalaoOpen: boolean;
  openTalao: () => void;
  closeTalao: () => void;
  selectSession: (id: string) => void;
  createSession: (clientName: string, channel: 'presencial' | 'whatsapp') => Promise<OrderSession>;
  closeSession: (id: string) => Promise<void>;
  reopenSession: (id: string) => Promise<void>;
  updateActiveItems: (items: CartItem[]) => Promise<void>;
  updateActiveShipping: (shipping: ShippingOption | null) => Promise<void>;
  linkClient: (clientId: string) => Promise<void>;
  // Gera (ou, se já existir, apenas devolve) o token do link de pagamento
  // da sessão ativa — ver POST /api/sessions/[id]/payment-link/route.ts.
  // Lança se a API recusar (carrinho vazio, sem frete, cliente incompleta).
  requestPaymentLink: () => Promise<string>;
}

const TalaoContext = createContext<TalaoContextValue | null>(null);

// Talão de pedidos — só existe pra quem está logada como vendedora (ver
// AppShell.tsx, monta esse provider condicionalmente). Guarda a lista de
// sessões e qual está "ativa" (a que recebe os itens quando a vendedora
// clica + na grade — ver CartProvider.tsx, que consulta useTalao() antes
// de decidir se escreve no carrinho pessoal ou na sessão ativa).
export function TalaoProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<OrderSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isTalaoOpen, setTalaoOpen] = useState(false);

  function refetchSessions() {
    return fetch('/api/sessions', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((all: OrderSession[] | null) => {
        if (all) setSessions(all);
      })
      .catch(() => {});
  }

  useEffect(() => {
    fetch('/api/sessions', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((all: OrderSession[]) => {
        setSessions(all);
        const firstOpen = all.find((s) => s.status === 'aberto');
        if (firstOpen) setActiveSessionId(firstOpen.id);
      })
      .catch(() => {});
  }, []);

  // Tempo real: se a cliente pagar um pedido de talão pelo link (outro
  // navegador, sem essa vendedora fazer nada) enquanto o talão está aberto
  // aqui, a sessão vira 'fechado' sozinha sem precisar de F5 — ver
  // web/src/lib/sseHub.ts e POST /api/pay/[token]/route.ts (quem dispara o
  // evento). Refetch simples em vez de tentar aplicar um diff — o volume de
  // eventos é baixo (só na confirmação de pagamento).
  useEffect(() => {
    const source = new EventSource('/api/sessions/stream');
    source.addEventListener('sessions-updated', () => {
      refetchSessions();
    });
    return () => source.close();
  }, []);

  const openSessions = sessions.filter((s) => s.status === 'aberto' || s.status === 'aguardando_pagamento');
  const activeSession = sessions.find((s) => s.id === activeSessionId) || null;

  async function createSession(clientName: string, channel: 'presencial' | 'whatsapp') {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientName, channel }),
    });
    const session: OrderSession = await res.json();
    setSessions((prev) => [...prev, session]);
    setActiveSessionId(session.id);
    return session;
  }

  async function closeSession(id: string) {
    await fetch(`/api/sessions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'fechado' }),
    });
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, status: 'fechado' } : s)));
    setActiveSessionId((cur) => (cur === id ? null : cur));
  }

  async function reopenSession(id: string) {
    await fetch(`/api/sessions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'aberto' }),
    });
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, status: 'aberto' } : s)));
    setActiveSessionId(id);
  }

  async function updateActiveItems(items: CartItem[]) {
    if (!activeSession) return;
    const id = activeSession.id;
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, items } : s)));
    await fetch(`/api/sessions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
  }

  async function updateActiveShipping(shipping: ShippingOption | null) {
    if (!activeSession) return;
    const id = activeSession.id;
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, shipping: shipping || undefined } : s)));
    await fetch(`/api/sessions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipping }),
    });
  }

  // Sempre chama a API — o servidor decide se reaproveita o token existente
  // (ainda válido) ou gera um novo (sem token ainda, ou o anterior expirou,
  // ver POST /api/sessions/[id]/payment-link).
  async function requestPaymentLink(): Promise<string> {
    if (!activeSession) throw new Error('Nenhum pedido ativo.');
    const id = activeSession.id;
    const res = await fetch(`/api/sessions/${id}/payment-link`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Não foi possível gerar o link.');
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, paymentToken: data.token, status: 'aguardando_pagamento' } : s))
    );
    return data.token as string;
  }

  // Vincula um cadastro de cliente (ver web/src/lib/clients.ts) à sessão
  // ativa — a API já sincroniza clientName a partir do cadastro e marca
  // essa vendedora como a última que atendeu essa cliente, então só
  // precisa aplicar o que voltou.
  async function linkClient(clientId: string) {
    if (!activeSession) return;
    const id = activeSession.id;
    const res = await fetch(`/api/sessions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId }),
    });
    const updated: OrderSession = await res.json();
    setSessions((prev) => prev.map((s) => (s.id === id ? updated : s)));
  }

  const value = useMemo<TalaoContextValue>(
    () => ({
      sessions,
      openSessions,
      activeSession,
      activeSessionId,
      isTalaoOpen,
      openTalao: () => setTalaoOpen(true),
      closeTalao: () => setTalaoOpen(false),
      selectSession: setActiveSessionId,
      createSession,
      closeSession,
      reopenSession,
      updateActiveItems,
      updateActiveShipping,
      linkClient,
      requestPaymentLink,
    }),
    [sessions, activeSessionId, isTalaoOpen]
  );

  return <TalaoContext.Provider value={value}>{children}</TalaoContext.Provider>;
}

// null quando não está dentro de <TalaoProvider> (cliente final comprando,
// ou vendedora ainda sem o provider montado) — CartProvider trata isso como
// "usa o carrinho pessoal", não é erro.
export function useTalao(): TalaoContextValue | null {
  return useContext(TalaoContext);
}
