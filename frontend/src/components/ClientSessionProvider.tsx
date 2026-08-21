'use client';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { OrderSessionSchema, type CartItem, type OrderSession, type ShippingOption } from '@/domain/orders/types';
import { pedidoRealtimeEventMessage, usePedidoRealtime, type PedidoParticipant, type PedidoPresence } from '@/lib/realtime/usePedidoRealtime';
import { apiFetch } from '@/lib/api-client';
import { useUpdatesRealtime } from '@/lib/realtime/useUpdatesRealtime';

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

  function refetch() {
    return apiFetch('/api/sessions/mine', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        const parsed = OrderSessionSchema.nullable().safeParse(json);
        setActiveSession(parsed.success ? parsed.data : null);
      })
      .catch(() => {});
  }

  useEffect(() => {
    refetch();
  }, []);

  // O socket aplica o snapshot da sessão sem F5: itens, frete e status;
  // a lista de presença informa quando a vendedora entra ou sai do pedido.
  const realtime = usePedidoRealtime({
    sessionId: activeSession?.id,
    onSession: setActiveSession,
    onPresence: setPresence,
    onParticipants: setParticipants,
    onEvent: (event) => toast.info(pedidoRealtimeEventMessage(event)),
    allowCustomerSessionCreation: !activeSession,
  });

  useUpdatesRealtime((update) => {
    if (update === 'sessions_updated') void refetch();
  });

  async function updateActiveItems(items: CartItem[]) {
    if (!activeSession) return;
    const id = activeSession.id;
    setActiveSession((prev) => (prev && prev.id === id ? { ...prev, items } : prev));
    const response = await realtime.updateSession({ items }).then(() => true).catch(() => false);
    // Sem isso, um pedido já pago/cancelado (ex.: a vendedora finalizou
    // enquanto a cliente ainda editava o carrinho) rejeita o PUT em
    // silêncio: o item some da tela mas nunca é salvo, e a cliente não
    // percebe. `refetch()` traz o estado real (a sessão fechada) de volta.
    if (!response) {
      toast.error('Este pedido já foi fechado. Atualizando...');
      await refetch();
    }
  }

  async function updateActiveShipping(shipping: ShippingOption | null) {
    if (!activeSession) return;
    const id = activeSession.id;
    setActiveSession((prev) => (prev && prev.id === id ? { ...prev, shipping: shipping || undefined } : prev));
    const response = await realtime.updateSession({ shipping: shipping || undefined }).then(() => true).catch(() => false);
    if (!response) {
      toast.error('Este pedido já foi fechado. Atualizando...');
      await refetch();
    }
  }

  async function createActiveSession(items: CartItem[]): Promise<OrderSession | null> {
    try {
      const session = await realtime.createCustomerSession(items);
      setActiveSession(session);
      return session;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível criar o pedido.');
      return null;
    }
  }

  function adoptSession(session: OrderSession) {
    setActiveSession(session);
  }

  const value = useMemo<ClientSessionContextValue>(
    () => ({ activeSession, presence, participants, updateActiveItems, updateActiveShipping, createActiveSession, adoptSession }),
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
