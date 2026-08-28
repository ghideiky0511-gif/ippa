'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useTenant } from '@/components/TenantProvider';
import { apiFetch } from '@/lib/api-client';
import { RealtimeEventSchema, type RealtimeEvent } from '@/contracts/realtime';
import { realtimeUrl } from './usePedidoRealtime';

export type RealtimeUpdate = 'sessions_updated' | 'orders_updated' | 'order_books_updated' | 'notifications_updated';

interface UpdatesRealtimeOptions {
  /** Evento tipado com payload (canal 'atualizacao_v2') — ver
   * applySessionEvent.ts. Só TalaoProvider/ClientSessionProvider usam isso
   * hoje; as demais telas continuam só no `onUpdate` legado abaixo. */
  onEvent?: (event: RealtimeEvent) => void;
  /** Disparado em toda (re)conexão. O namespace /atualizacoes não manda
   * snapshot no join (ao contrário de /pedidos) — cada reconexão pode ter
   * perdido eventos no meio (o socket usa `reconnection: false` + ticket de
   * uso único, ver connect() abaixo), então quem usa `onEvent` precisa de
   * um jeito de re-sincronizar do zero. Não dispara na primeira conexão
   * (o caller já faz o fetch inicial no mount). */
  onResync?: () => void;
}

/** Mantém o canal Socket.IO da fila. `onUpdate` é o sinal legado, sem dados
 * sensíveis, ainda usado por várias telas (workspace/, /pedidos) que reagem
 * com refetch — ver `options.onEvent` para o canal novo com payload. */
export function useUpdatesRealtime(onUpdate: (update: RealtimeUpdate) => void, options?: UpdatesRealtimeOptions): void {
  const { tenant } = useTenant();
  const onUpdateRef = useRef(onUpdate);
  const onEventRef = useRef(options?.onEvent);
  const onResyncRef = useRef(options?.onResync);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
    onEventRef.current = options?.onEvent;
    onResyncRef.current = options?.onResync;
  }, [onUpdate, options?.onEvent, options?.onResync]);

  useEffect(() => {
    let disposed = false;
    let socket: Socket | null = null;
    let retryTimer: number | null = null;
    let retryDelay = 1_000;
    let hasConnectedOnce = false;

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
        const response = await apiFetch('/api/realtime-ticket', { method: 'POST', cache: 'no-store' });
        const payload = await response.json().catch(() => null) as { token?: string } | null;
        if (!response.ok || !payload?.token) throw new Error('Não foi possível autorizar as atualizações em tempo real.');
        if (disposed) return;
        socket = io(`${realtimeUrl()}/atualizacoes`, {
          auth: { tenantSlug: tenant.slug, ticket: payload.token },
          transports: ['websocket'],
          reconnection: false,
        });
        socket.on('connect', () => {
          retryDelay = 1_000;
          // Sem snapshot-on-join neste namespace — toda reconexão (não a
          // primeira conexão) pode ter perdido eventos no meio.
          if (hasConnectedOnce) onResyncRef.current?.();
          hasConnectedOnce = true;
        });
        socket.on('atualizacao', (event: { type?: RealtimeUpdate }) => {
          if (event.type) onUpdateRef.current(event.type);
        });
        socket.on('atualizacao_v2', (event: unknown) => {
          const parsed = RealtimeEventSchema.safeParse(event);
          if (parsed.success) onEventRef.current?.(parsed.data);
        });
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
      socket?.disconnect();
    };
  }, [tenant.slug]);
}
