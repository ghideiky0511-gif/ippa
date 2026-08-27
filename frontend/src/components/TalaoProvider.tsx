'use client';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Client } from '@/domain/clients/types';
import type { CartItem, OrderBook, OrderSession } from '@/domain/orders/types';
import { useUpdatesRealtime } from '@/lib/realtime/useUpdatesRealtime';
import { usePedidoRealtime, type PedidoParticipant, type PedidoPresence } from '@/lib/realtime/usePedidoRealtime';
import { applyBookUpsert, applySessionEventToList } from '@/lib/realtime/applySessionEvent';
import { activateOrderBook, cancelOrderBook, createOrderBook, fetchActiveOrderBook, fetchOrderBooks, fetchOrderSession } from '@/lib/ordersClient';

interface TalaoContextValue {
  sessions: OrderSession[]; // todas (aberta + fechada) — usado por "buscar existentes"
  openSessions: OrderSession[]; // status 'aberto' OU 'aguardando_pagamento' — o que aparece no painel do talão
  activeSession: OrderSession | null;
  activeSessionId: string | null;
  isTalaoOpen: boolean;
  openTalao: () => void;
  closeTalao: () => void;
  selectSession: (id: string) => void;
  // Reaplica uma sessão já carregada (e o talão dela) como ativa, sem
  // chamar a API — usado pelo deep link ?session= (ver CatalogApp.tsx),
  // que só deve mudar o que a tela mostra, não qual talão está "ativo"
  // pro backend (isso só acontece via selectBook, uma escolha explícita).
  resumeSession: (sessionId: string) => void;
  createSession: (clientName: string, channel: 'presencial' | 'whatsapp') => Promise<OrderSession>;
  closeSession: (id: string) => Promise<void>;
  reopenSession: (id: string) => Promise<void>;
  updateActiveItems: (items: CartItem[]) => Promise<void>;
  linkClient: (clientId: string) => Promise<void>;
  // Gera (ou, se já existir, apenas devolve) o token do link de pagamento
  // da sessão ativa — ver POST /api/sessions/[id]/payment-link/route.ts.
  // Lança se a API recusar (carrinho vazio, sem frete, cliente incompleta).
  requestPaymentLink: () => Promise<string>;
  // Talões (OrderBook) abertos da vendedora — uma vendedora pode manter
  // vários em paralelo (ex.: feira + loja) e trocar entre eles; sessions
  // ficam scoped ao talão ativo no painel (activeBookSessions), mas a
  // busca "existentes" continua olhando todas as sessions (todos os
  // talões) — ver TalaoDrawer.tsx.
  books: OrderBook[];
  activeBookId: string | null;
  activeBook: OrderBook | null;
  activeBookSessions: OrderSession[];
  cancelledBookSessions: OrderSession[];
  selectBook: (id: string) => Promise<void>;
  createBook: (name: string) => Promise<void>;
  cancelBook: (id: string) => Promise<void>;
  presence: PedidoPresence[];
  participants: PedidoParticipant[];
  // Cadastro completo dos clientes com sessão aberta no talão ativo — usado
  // pro subtexto de documento no drawer (ver TalaoDrawer.tsx). Só cobre
  // quem está com pedido aberto agora, não o histórico inteiro.
  clientsById: Record<string, Client>;
  // Membership ativa em grupo comercial (ver commercial_group_members) de
  // quem está com sessão aberta agora — usado pra agrupar matriz + filiais
  // no drawer (client sem grupo não entra neste map). isPrimary marca quem
  // é a "matriz" da composição.
  groupMembershipByClientId: Record<string, { groupId: string; isPrimary: boolean } | null>;
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
  const [books, setBooks] = useState<OrderBook[]>([]);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [presence, setPresence] = useState<PedidoPresence[]>([]);
  const [participants, setParticipants] = useState<PedidoParticipant[]>([]);
  const [clientsById, setClientsById] = useState<Record<string, Client>>({});
  const [groupMembershipByClientId, setGroupMembershipByClientId] = useState<Record<string, { groupId: string; isPrimary: boolean } | null>>({});

  function refetchSessions() {
    return fetch('/api/sessions', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((all: OrderSession[] | null) => {
        if (all) setSessions(all);
      })
      .catch(() => {});
  }

  function refetchBooks() {
    return fetchOrderBooks('aberto').then(setBooks).catch(() => {});
  }

  useEffect(() => {
    Promise.all([
      fetch('/api/sessions', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : [])) as Promise<OrderSession[]>,
      fetchOrderBooks('aberto').catch(() => [] as OrderBook[]),
    ]).then(async ([all, openBooks]) => {
      setSessions(all);
      setBooks(openBooks);
      const firstOpen = all.find((s) => s.status === 'aberto');
      if (firstOpen) setActiveSessionId(firstOpen.id);
      const active = openBooks.find((book) => book.isActive);
      if (active) {
        setActiveBookId(active.id);
        return;
      }
      // Vendedora sem nenhum talão aberto ainda — a API cria (ou reabre) o
      // "Talão atual" dela.
      try {
        const book = await fetchActiveOrderBook();
        setBooks((current) => [book, ...current]);
        setActiveBookId(book.id);
      } catch {
        // sem talão disponível agora — painel do talão fica vazio até a próxima atualização em tempo real
      }
    }).catch(() => {});
  }, []);

  // Resync pontual de uma sessão só (buraco na cadeia causal de
  // session_items — ver applySessionEvent.ts) em vez do talão inteiro.
  function resyncSession(sessionId: string) {
    fetchOrderSession(sessionId)
      .then((session) => setSessions((prev) => (prev.some((s) => s.id === session.id) ? prev.map((s) => (s.id === session.id ? session : s)) : [...prev, session])))
      .catch(() => {});
  }

  useUpdatesRealtime(
    () => {}, // sinal legado — este provider só reage ao evento com payload abaixo
    {
      onEvent: (event) => {
        if (event.t === 'book_upsert') {
          setBooks((current) => applyBookUpsert(current, event.book));
          return;
        }
        setSessions((current) => {
          const result = applySessionEventToList(current, event);
          if (result.resyncSessionId) resyncSession(result.resyncSessionId);
          return result.sessions;
        });
      },
      // /atualizacoes não manda snapshot no join — toda reconexão pode ter
      // perdido eventos no meio, então refaz o fetch completo uma vez.
      onResync: () => {
        void refetchSessions();
        void refetchBooks();
      },
    },
  );

  // Rede de segurança: mesmo com os eventos acima, um heartbeat de 30s
  // corrige qualquer drift silencioso — só com a aba visível, pra não
  // queimar recurso do plano free do Render em abas de fundo.
  useEffect(() => {
    function tick() {
      if (document.visibilityState !== 'visible') return;
      void refetchSessions();
      void refetchBooks();
    }
    const interval = window.setInterval(tick, 30_000);
    function onVisible() {
      if (document.visibilityState === 'visible') tick();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const openSessions = sessions.filter((s) => s.status === 'aberto' || s.status === 'aguardando_pagamento');
  const activeSession = sessions.find((s) => s.id === activeSessionId) || null;
  const activeBook = books.find((b) => b.id === activeBookId) || null;
  const activeBookSessions = sessions.filter((s) => s.orderBookId === activeBookId && (s.status === 'aberto' || s.status === 'aguardando_pagamento'));
  const cancelledBookSessions = sessions.filter((s) => s.orderBookId === activeBookId && s.status === 'cancelado');

  // Busca o cadastro completo de quem tem pedido aberto agora — só o
  // necessário pro subtexto de documento (ver TalaoDrawer.tsx), não o
  // talão inteiro.
  const openClientIds = [...new Set(activeBookSessions.map((s) => s.clientId).filter((id): id is string => Boolean(id)))].sort().join(',');
  useEffect(() => {
    const ids = openClientIds ? openClientIds.split(',') : [];
    const missing = ids.filter((id) => !(id in clientsById));
    if (missing.length === 0) return;
    Promise.all(missing.map((id) => fetch(`/api/clients/${id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)))
      .then((fetched) => {
        setClientsById((current) => {
          const next = { ...current };
          fetched.forEach((client: Client | null, index) => {
            if (client) next[missing[index]] = client;
          });
          return next;
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openClientIds]);

  // Membership ativa em grupo comercial de quem tem pedido aberto agora —
  // é o que permite o drawer colapsar matriz + filiais (ver masterIdFor em
  // TalaoDrawer.tsx). Client sem grupo não aparece na resposta, então cada
  // id buscado sem match vira `null` no map — sentinela "já buscado, sem
  // grupo" pra não reconsultar de novo enquanto a sessão continuar aberta.
  useEffect(() => {
    const ids = openClientIds ? openClientIds.split(',') : [];
    const missing = ids.filter((id) => !(id in groupMembershipByClientId));
    if (missing.length === 0) return;
    fetch(`/api/commercial-groups/memberships?clientIds=${missing.join(',')}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((members: Array<{ clientId: string; groupId: string; isPrimary: boolean }>) => {
        setGroupMembershipByClientId((current) => {
          const next = { ...current };
          for (const id of missing) next[id] = null;
          for (const member of members) next[member.clientId] = { groupId: member.groupId, isPrimary: member.isPrimary };
          return next;
        });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openClientIds]);

  const realtime = usePedidoRealtime({
    sessionId: activeSession?.id,
    // Guarda monotônica (mesmo updatedAt usado pelo canal /atualizacoes,
    // ver applySessionEvent.ts): sem isso, o snapshot deste canal e o do
    // /atualizacoes podiam se sobrescrever fora de ordem — era exatamente o
    // "overlap" na tela ao alterar produto rapidamente.
    onSession: (session) => setSessions((prev) => prev.map((item) => {
      if (item.id !== session.id) return item;
      return session.updatedAt < item.updatedAt ? item : session;
    })),
    onPresence: setPresence,
    onParticipants: setParticipants,
  });

  function resumeSession(sessionId: string) {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;
    setActiveSessionId(session.id);
    setActiveBookId(session.orderBookId);
  }

  async function selectBook(id: string) {
    const active = await activateOrderBook(id);
    setBooks((current) => current.map((book) => ({ ...book, isActive: book.id === active.id })));
    setActiveBookId(active.id);
    setActiveSessionId(null);
  }

  async function createBook(name: string) {
    const created = await createOrderBook(name);
    setBooks((current) => [created, ...current.map((book) => ({ ...book, isActive: false }))]);
    setActiveBookId(created.id);
    setActiveSessionId(null);
  }

  async function cancelBook(id: string) {
    const cancelled = await cancelOrderBook(id);
    setBooks((current) => current.map((book) => (book.id === cancelled.id ? cancelled : book)));
    setActiveSessionId((cur) => {
      const session = sessions.find((s) => s.id === cur);
      return session && session.orderBookId === id ? null : cur;
    });
  }

  async function createSession(clientName: string, channel: 'presencial' | 'whatsapp') {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientName, channel, orderBookId: activeBookId }),
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
    await realtime.updateSession({ items });
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
      resumeSession,
      createSession,
      closeSession,
      reopenSession,
      updateActiveItems,
      linkClient,
      requestPaymentLink,
      books,
      activeBookId,
      activeBook,
      activeBookSessions,
      cancelledBookSessions,
      selectBook,
      createBook,
      cancelBook,
      presence,
      participants,
      clientsById,
      groupMembershipByClientId,
    }),
    [sessions, activeSessionId, isTalaoOpen, books, activeBookId, activeBook, activeBookSessions, cancelledBookSessions, presence, participants, clientsById, groupMembershipByClientId]
  );

  return <TalaoContext.Provider value={value}>{children}</TalaoContext.Provider>;
}

// null quando não está dentro de <TalaoProvider> (cliente final comprando,
// ou vendedora ainda sem o provider montado) — CartProvider trata isso como
// "usa o carrinho pessoal", não é erro.
export function useTalao(): TalaoContextValue | null {
  return useContext(TalaoContext);
}
