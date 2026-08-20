'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useTenant } from '@/components/TenantProvider';
import { apiFetch } from '@/lib/api-client';
import { realtimeUrl } from './usePedidoRealtime';

export type RealtimeUpdate = 'sessions_updated' | 'orders_updated' | 'order_books_updated';

/** Mantém o canal Socket.IO da fila; ele só emite sinais sem dados sensíveis. */
export function useUpdatesRealtime(onUpdate: (update: RealtimeUpdate) => void): void {
  const { tenant } = useTenant();
  const onUpdateRef = useRef(onUpdate);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    let disposed = false;
    let socket: Socket | null = null;
    let retryTimer: number | null = null;
    let retryDelay = 1_000;

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
        socket.on('connect', () => { retryDelay = 1_000; });
        socket.on('atualizacao', (event: { type?: RealtimeUpdate }) => {
          if (event.type) onUpdateRef.current(event.type);
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
