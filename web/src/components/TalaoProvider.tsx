'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CartItem, OrderSession } from '@/lib/types';

interface TalaoContextValue {
  sessions: OrderSession[]; // todas (aberta + fechada) — usado por "buscar existentes"
  openSessions: OrderSession[]; // só status 'aberto' — o que aparece no painel do talão
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
  linkClient: (clientId: string) => Promise<void>;
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

  const openSessions = sessions.filter((s) => s.status === 'aberto');
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
      linkClient,
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
