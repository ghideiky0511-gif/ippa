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
