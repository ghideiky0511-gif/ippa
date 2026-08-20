'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useTenant } from '@/components/TenantProvider';
import type { AuthUser } from '@/domain/clients/types';
import type { CartItem, OrderSession, ShippingOption } from '@/domain/orders/types';
import { apiFetch } from '@/lib/api-client';

export interface PedidoPresence {
  userId: string;
  role: AuthUser['role'];
  name: string;
}

export interface PedidoParticipant {
  userId: string;
  firstJoinedAt: string;
  lastJoinedAt: string;
  lastLeftAt?: string;
  joinCount: number;
  user: Pick<AuthUser, 'id' | 'name' | 'role'>;
}

interface PedidoRealtimeOptions {
  sessionId: string | null | undefined;
  onSession: (session: OrderSession) => void;
  onPresence?: (presence: PedidoPresence[]) => void;
  onParticipants?: (participants: PedidoParticipant[]) => void;
  onEvent?: (event: PedidoRealtimeEvent) => void;
}

export type PedidoRealtimeEvent =
  | { type: 'peca_adicionada'; item: CartItem; quantity: number }
  | { type: 'peca_retirada'; item: CartItem; quantity: number }
  | { type: 'frete_alterado'; shipping?: ShippingOption }
  | { type: 'seller_entrou'; seller: PedidoPresence }
  | { type: 'seller_saiu'; seller: PedidoPresence };

export function pedidoRealtimeEventMessage(event: PedidoRealtimeEvent): string {
  switch (event.type) {
    case 'peca_adicionada':
      return `${event.quantity}x ${event.item.name} adicionada ao pedido.`;
    case 'peca_retirada':
      return `${event.quantity}x ${event.item.name} retirada do pedido.`;
    case 'frete_alterado':
      return event.shipping ? `Frete alterado para ${event.shipping.label}.` : 'Frete removido do pedido.';
    case 'seller_entrou':
      return `${event.seller.name} entrou no pedido.`;
    case 'seller_saiu':
      return `${event.seller.name} saiu do pedido.`;
  }
}

function sameShipping(a?: ShippingOption, b?: ShippingOption): boolean {
  return a?.id === b?.id && a?.label === b?.label && a?.price === b?.price && a?.prazo === b?.prazo;
}

function sessionEvents(previous: OrderSession, current: OrderSession): PedidoRealtimeEvent[] {
  const before = new Map(previous.items.map((item) => [item.key, item]));
  const after = new Map(current.items.map((item) => [item.key, item]));
  const events: PedidoRealtimeEvent[] = [];

  for (const [key, item] of after) {
    const difference = item.qty - (before.get(key)?.qty || 0);
    if (difference > 0) events.push({ type: 'peca_adicionada', item, quantity: difference });
    if (difference < 0) events.push({ type: 'peca_retirada', item, quantity: Math.abs(difference) });
  }
  for (const [key, item] of before) {
    if (!after.has(key) && item.qty > 0) events.push({ type: 'peca_retirada', item, quantity: item.qty });
  }
  if (!sameShipping(previous.shipping, current.shipping)) events.push({ type: 'frete_alterado', shipping: current.shipping });
  return events;
}

export function realtimeUrl(): string {
  // O backend de WebSocket pode ficar em outra origem do frontend. Em
  // desenvolvimento o fallback acompanha a porta exposta pelo compose.
  return process.env.NEXT_PUBLIC_REALTIME_URL || 'http://localhost:3011';
}

/**
 * Mantém uma conexão Socket.IO para uma única sessão de pedido.
 *
 * O ticket é propositalmente consumido no handshake; por isso cada tentativa
 * de reconexão pede um ticket novo, em vez de deixar o Socket.IO reutilizar um
 * token já usado. `sessao_atualizada` contém o snapshot completo e cobre
 * adição/remoção de peça, alteração de frete, cliente e status.
 */
export function usePedidoRealtime({ sessionId, onSession, onPresence, onParticipants, onEvent }: PedidoRealtimeOptions): void {
  const { tenant } = useTenant();
  const onSessionRef = useRef(onSession);
  const onPresenceRef = useRef(onPresence);
  const onParticipantsRef = useRef(onParticipants);
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onSessionRef.current = onSession;
    onPresenceRef.current = onPresence;
    onParticipantsRef.current = onParticipants;
    onEventRef.current = onEvent;
  }, [onEvent, onParticipants, onPresence, onSession]);

  useEffect(() => {
    if (!sessionId) return;

    let disposed = false;
    let socket: Socket | null = null;
    let retryTimer: number | null = null;
    let retryDelay = 1_000;
    let previousSession: OrderSession | null = null;
    let previousPresence: PedidoPresence[] | null = null;

    onParticipantsRef.current?.([]);

    const receiveSession = (session: OrderSession, isSnapshot = false) => {
      if (!isSnapshot && previousSession) {
        sessionEvents(previousSession, session).forEach((event) => onEventRef.current?.(event));
      }
      previousSession = session;
      onSessionRef.current(session);
    };

    const receivePresence = (presence: PedidoPresence[]) => {
      if (previousPresence) {
        const before = new Map(previousPresence.filter((person) => person.role === 'vendedora').map((person) => [person.userId, person]));
        const after = new Map(presence.filter((person) => person.role === 'vendedora').map((person) => [person.userId, person]));
        for (const [userId, seller] of after) if (!before.has(userId)) onEventRef.current?.({ type: 'seller_entrou', seller });
        for (const [userId, seller] of before) if (!after.has(userId)) onEventRef.current?.({ type: 'seller_saiu', seller });
      }
      previousPresence = presence;
      onPresenceRef.current?.(presence);
    };

    const scheduleReconnect = () => {
      if (disposed || retryTimer) return;
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        void connect();
      }, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 10_000);
    };

    const connect = async () => {
      try {
        const ticketResponse = await apiFetch(`/api/sessions/${sessionId}/realtime-ticket`, {
          method: 'POST',
          cache: 'no-store',
        });
        const ticketPayload = await ticketResponse.json().catch(() => null) as { token?: string } | null;
        if (!ticketResponse.ok || !ticketPayload?.token) throw new Error('Não foi possível autorizar o tempo real do pedido.');
        if (disposed) return;

        socket = io(`${realtimeUrl()}/pedidos`, {
          auth: { tenantSlug: tenant.slug, ticket: ticketPayload.token },
          transports: ['websocket'],
          reconnection: false,
        });
        socket.on('connect', () => {
          retryDelay = 1_000;
          socket?.emit('entrar_sessao', {});
        });
        socket.on('sessao_snapshot', (session: OrderSession) => receiveSession(session, true));
        socket.on('sessao_atualizada', receiveSession);
        socket.on('presenca_atualizada', receivePresence);
        socket.on('participantes_atualizados', (participants: PedidoParticipant[]) => onParticipantsRef.current?.(participants));
        socket.on('connect_error', scheduleReconnect);
        socket.on('disconnect', (reason) => {
          if (reason !== 'io client disconnect') scheduleReconnect();
        });
      } catch {
        scheduleReconnect();
      }
    };

    void connect();
    return () => {
      disposed = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      socket?.emit('sair_sessao');
      socket?.disconnect();
    };
  }, [sessionId, tenant.slug]);
}
