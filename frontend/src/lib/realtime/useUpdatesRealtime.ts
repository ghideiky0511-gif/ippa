'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useTenant } from '@/components/TenantProvider';
import { apiFetch } from '@/lib/api-client';
import {
  RealtimeEventSchema,
  type AtualizacoesClientToServerEvents,
  type AtualizacoesServerToClientEvents,
  type RealtimeEvent,
  type RealtimeUpdate,
} from '@/contracts/realtime';
import { RECONNECT_MAX_DELAY_MS, realtimeUrl } from './usePedidoRealtime';

// Generics invertidos em relacao ao servidor (typescript.md). Este namespace e
// unidirecional: o cliente so escuta, por isso o mapa cliente->servidor e
// vazio -- um emit acidental daqui vira erro de compilacao.
type UpdatesSocket = Socket<AtualizacoesServerToClientEvents, AtualizacoesClientToServerEvents>;

/** Janela em que reconexões sucessivas viram um único resync. Curta o
 * bastante pra não atrasar a correção de estado de forma perceptível, longa
 * o bastante pra absorver um ciclo de queda-e-volta do socket. */
const RESYNC_COALESCE_MS = 2_000;

// Reexportado pra nao mexer nos imports das telas; a definicao virou contrato
// compartilhado com o backend (@/contracts/realtime).
export type { RealtimeUpdate };

interface UpdatesRealtimeOptions {
  /** Evento tipado com payload (canal 'atualizacao_v2') — ver
   * applySessionEvent.ts. Só TalaoProvider/ClientSessionProvider usam isso
   * hoje; as demais telas continuam só no `onUpdate` legado abaixo. */
  onEvent?: (event: RealtimeEvent) => void;
  /** Disparado em toda conexão, inclusive a primeira. O namespace
   * /atualizacoes não manda snapshot no join (ao contrário de /pedidos) e é
   * a única fonte de mudanças — quem usa isto não faz polling. Então:
   * - reconexão: pode ter perdido eventos no meio (o socket usa
   *   `reconnection: false` + ticket de uso único, ver connect() abaixo);
   * - primeira conexão: o fetch do mount leu o banco antes de o socket
   *   entrar nas rooms, e um evento nesse intervalo se perderia de vez.
   * O servidor entra nas rooms no handler de `connection`, antes de o
   * cliente ver `connect` — um fetch disparado daqui em diante não tem
   * buraco. */
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
    let socket: UpdatesSocket | null = null;
    let retryTimer: number | null = null;
    let resyncTimer: number | null = null;
    let retryDelay = 1_000;

    const scheduleReconnect = () => {
      if (disposed || retryTimer) return;
      // Jitter: sem ele, todo cliente que caiu junto (deploy, instabilidade do
      // backend) espera exatamente o mesmo tempo e reconecta no mesmo instante,
      // derrubando o backend de novo assim que ele volta. O teto alto é a outra
      // metade: insistir a cada 10s com o backend fora do ar só alimenta o
      // problema -- foi uma rajada dessas que esgotou o pool do Postgres.
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        void connect();
      }, retryDelay * (0.5 + Math.random()));
      retryDelay = Math.min(retryDelay * 2, RECONNECT_MAX_DELAY_MS);
    };

    // Uma sequência de quedas e reconexões em poucos segundos precisa de UM
    // resync, não de um por reconexão: o refetch traz o estado inteiro, então
    // o segundo seguido não acrescenta nada e só multiplica carga justamente
    // quando o backend está mal. Agenda no fim da janela (não na borda de
    // entrada) pra que reconexões em sequência caiam todas no mesmo timer.
    const requestResync = () => {
      if (disposed || resyncTimer) return;
      resyncTimer = window.setTimeout(() => {
        resyncTimer = null;
        onResyncRef.current?.();
      }, RESYNC_COALESCE_MS * (0.5 + Math.random()));
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
          // Sem snapshot-on-join neste namespace — ver onResync acima.
          requestResync();
        });
        socket.on('atualizacao', (event) => {
          if (event?.type) onUpdateRef.current(event.type);
        });
        // O generic garante o formato em tempo de compilacao; o Zod continua
        // sendo a validacao de runtime, porque o que chega pelo fio e entrada
        // nao confiavel -- a propria doc do Socket.IO avisa que os type hints
        // "do not replace proper validation/sanitization of the input"
        // (typescript.md).
        socket.on('atualizacao_v2', (event) => {
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
      if (resyncTimer) window.clearTimeout(resyncTimer);
      socket?.disconnect();
    };
  }, [tenant.slug]);
}
