'use client';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { OrderSessionSchema, type CartItem, type OrderSession, type ShippingOption } from '@/domain/orders/types';
import { pedidoRealtimeEventMessage, usePedidoRealtime, type PedidoParticipant, type PedidoPresence } from '@/lib/realtime/usePedidoRealtime';
import { apiFetch } from '@/lib/api-client';
import { useUpdatesRealtime } from '@/lib/realtime/useUpdatesRealtime';
import { applySessionEventToActive } from '@/lib/realtime/applySessionEvent';

// Contrato mínimo que CartProvider.tsx precisa pra escrever num pedido
// compartilhado — mesmo formato que TalaoProvider.tsx expõe (ver
// TalaoContextValue), só que reduzido: a cliente não cria/fecha/reabre
// sessões nem vincula cadastro, essas são ações da vendedora.
interface ClientSessionContextValue {
  activeSession: OrderSession | null;
  presence: PedidoPresence[];
  participants: PedidoParticipant[];
  updateActiveItems: (items: CartItem[]) => Promise<void>;
  updateActiveShipping: (shipping: ShippingOption | null) => Promise<void>;
  createActiveSession: (items: CartItem[]) => Promise<OrderSession | null>;
  adoptSession: (session: OrderSession) => void;
  releaseActiveSession: (sessionId: string) => void;
}

const ClientSessionContext = createContext<ClientSessionContextValue | null>(null);

// Contraparte de TalaoProvider.tsx pro lado da cliente — deliberadamente um
// contexto SEPARADO (não reaproveita TalaoContext): /frete, /pagamento e
// useTalaoClientGate.ts leem useTalao() diretamente pra decidir UI
// exclusiva da vendedora ("gerar link de pagamento", bloqueio de checkout
// direto). Se a cliente alimentasse o mesmo contexto, essas telas
// mostrariam a UI errada pra ela. Mantendo os dois separados, essas telas
// não precisam de nenhuma mudança — continuam corretas porque useTalao()
// segue exclusivo de vendedora (ver AppShell.tsx, só monta
// ClientSessionProvider pra role 'cliente').
export function ClientSessionProvider({ children }: { children: ReactNode }) {
  const [activeSession, setActiveSession] = useState<OrderSession | null>(null);
  const [presence, setPresence] = useState<PedidoPresence[]>([]);
  const [participants, setParticipants] = useState<PedidoParticipant[]>([]);
  const pendingAssignmentRef = useRef(false);

  function refetch(): Promise<OrderSession | undefined> {
    return apiFetch('/api/sessions/mine', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        const parsed = OrderSessionSchema.nullable().safeParse(json);
        const session = parsed.success ? parsed.data : null;
        setActiveSession(session);
        return session ?? undefined;
      })
      .catch(() => undefined);
  }

  // Assim que a cliente loga (não só quando adiciona a primeira peça), já
  // garante uma sessão online vinculada a uma vendedora — combinado com o
  // usuário: o talão precisa mostrar quem está logada mesmo de carrinho
  // vazio, pra vendedora poder iniciar o atendimento. Sem sessão nenhuma
  // ainda (refetch veio vazio), dispara createActiveSession([]) — mesmo
  // caminho de atribuição que addToCart já usa, só que sem itens.
  useEffect(() => {
    refetch().then((session) => {
      if (!session) void createActiveSession([]);
    });
  }, []);

  // O socket aplica o snapshot da sessão sem F5: itens, frete e status;
  // a lista de presença informa quando a vendedora entra ou sai do pedido.
  const realtime = usePedidoRealtime({
    sessionId: activeSession?.id,
    // Guarda monotônica (mesmo updatedAt usado pelo canal /atualizacoes,
    // ver applySessionEvent.ts): sem isso, o snapshot deste canal e o do
    // /atualizacoes podiam se sobrescrever fora de ordem.
    onSession: (session) => setActiveSession((prev) => {
      if (prev && prev.id === session.id && session.updatedAt < prev.updatedAt) return prev;
      return session;
    }),
    onPresence: setPresence,
    onParticipants: setParticipants,
    onEvent: (event) => toast.info(pedidoRealtimeEventMessage(event)),
    allowCustomerSessionCreation: !activeSession,
  });

  useUpdatesRealtime(
    () => {}, // sinal legado — este provider só reage ao evento com payload abaixo
    {
      onEvent: (event) => {
        if (event.t === 'book_upsert') return; // cliente não vê talões
        setActiveSession((current) => {
          const result = applySessionEventToActive(current, event);
          if (result.resync) void refetch();
          return result.session;
        });
      },
      // /atualizacoes não manda snapshot no join — toda reconexão pode ter
      // perdido eventos no meio.
      onResync: () => void refetch(),
    },
  );

  // Rede de segurança: heartbeat de 30s corrige qualquer drift silencioso —
  // só com a aba visível, pra não queimar recurso do plano free do Render
  // em abas de fundo.
  useEffect(() => {
    function tick() {
      if (document.visibilityState !== 'visible') return;
      void refetch();
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

  async function updateActiveItems(items: CartItem[]) {
    if (!activeSession) return;
    const id = activeSession.id;
    setActiveSession((prev) => (prev && prev.id === id ? { ...prev, items } : prev));
    try {
      await realtime.updateSession({ items });
    } catch (error) {
      // Só diz que fechou depois de confirmar isso no servidor. Uma queda ou
      // reconexão do WebSocket não altera o status do pedido.
      const current = await refetch();
      toast.error(
        current?.status === 'fechado' || current?.status === 'cancelado'
          ? 'Este pedido já foi fechado. Atualizando...'
          : error instanceof Error ? error.message : 'Não foi possível atualizar o pedido. Tente novamente.',
      );
    }
  }

  async function updateActiveShipping(shipping: ShippingOption | null) {
    if (!activeSession) return;
    const id = activeSession.id;
    setActiveSession((prev) => (prev && prev.id === id ? { ...prev, shipping: shipping || undefined } : prev));
    try {
      await realtime.updateSession({ shipping: shipping || undefined });
    } catch (error) {
      const current = await refetch();
      toast.error(
        current?.status === 'fechado' || current?.status === 'cancelado'
          ? 'Este pedido já foi fechado. Atualizando...'
          : error instanceof Error ? error.message : 'Não foi possível atualizar o pedido. Tente novamente.',
      );
    }
  }

  async function createActiveSession(items: CartItem[]): Promise<OrderSession | null> {
    // Sem ninguém disponível, o carrinho continua local e o checkout direto
    // permanece liberado. Evita pedir uma nova atribuição a cada alteração.
    if (pendingAssignmentRef.current) return null;
    try {
      const result = await realtime.createCustomerSession(items);
      if (!result.session) {
        if (result.pendingAssignment) {
          pendingAssignmentRef.current = true;
          toast.info(result.aviso || 'Seu carrinho está salvo. Uma vendedora será notificada assim que estiver disponível.');
        }
        return null;
      }
      pendingAssignmentRef.current = false;
      setActiveSession(result.session);
      return result.session;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível criar o pedido.');
      return null;
    }
  }

  function adoptSession(session: OrderSession) {
    setActiveSession(session);
  }

  // O checkout já encerrou a sessão no backend. Limpa apenas o estado local,
  // sem emitir um último update com `items: []` contra o pedido concluído.
  function releaseActiveSession(sessionId: string) {
    setActiveSession((current) => current?.id === sessionId ? null : current);
    setPresence([]);
    setParticipants([]);
  }

  const value = useMemo<ClientSessionContextValue>(
    () => ({ activeSession, presence, participants, updateActiveItems, updateActiveShipping, createActiveSession, adoptSession, releaseActiveSession }),
    [activeSession, participants, presence]
  );

  return <ClientSessionContext.Provider value={value}>{children}</ClientSessionContext.Provider>;
}

// null quando não está dentro de <ClientSessionProvider> (vendedora,
// anônimo, ou cliente logada ainda sem o provider montado) — CartProvider
// trata isso como "sem sessão compartilhada", não é erro.
export function useClientSession(): ClientSessionContextValue | null {
  return useContext(ClientSessionContext);
}
