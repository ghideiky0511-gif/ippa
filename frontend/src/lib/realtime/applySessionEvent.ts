import type { OrderBook, OrderSession } from '@/domain/orders/types';
import type { RealtimeEvent } from '@/contracts/realtime';
import { applyItemsDelta } from '@/lib/cartItemsDelta';

/**
 * Regra de aplicação incremental dos eventos de `/atualizacoes` — substitui
 * o refetch completo de GET /api/sessions + GET /api/order-books.
 *
 * Guarda monotônica: um evento com `at` mais velho que `local.updatedAt`
 * nunca sobrescreve o estado local — é o que evita o "overlap" entre o
 * snapshot do namespace /pedidos (sessão ativa) e este canal chegando fora
 * de ordem. `session_patch.patch` já carrega o próprio `updatedAt` (o campo
 * não é omitido no backend, ver updateBroadcast.ts), então o spread por
 * cima do estado local já atualiza tudo de uma vez.
 */
function isStale(localUpdatedAt: string, eventAt: string): boolean {
  return eventAt < localUpdatedAt;
}

export interface ListApplyResult {
  sessions: OrderSession[];
  /** Buraco na cadeia causal de um session_items — pede resync só dessa
   * sessão (GET /api/sessions/:id), não a lista inteira. */
  resyncSessionId?: string;
}

/** Aplica um evento a uma lista de sessões conhecidas (TalaoProvider —
 * vendedora/administrador, que enxergam várias sessões ao mesmo tempo). */
export function applySessionEventToList(sessions: OrderSession[], event: RealtimeEvent): ListApplyResult {
  switch (event.t) {
    case 'session_created': {
      const exists = sessions.some((s) => s.id === event.session.id);
      if (!exists) return { sessions: [...sessions, event.session] };
      return {
        sessions: sessions.map((s) =>
          s.id === event.session.id && !isStale(s.updatedAt, event.at) ? { ...s, ...event.session } : s,
        ),
      };
    }
    case 'session_patch':
      return {
        sessions: sessions.map((s) =>
          s.id === event.sid && !isStale(s.updatedAt, event.at) ? { ...s, ...event.patch } : s,
        ),
      };
    case 'session_items': {
      const local = sessions.find((s) => s.id === event.sid);
      if (!local) return { sessions };
      if (local.updatedAt !== event.prev) return { sessions, resyncSessionId: event.sid };
      return {
        sessions: sessions.map((s) =>
          s.id === event.sid ? { ...s, items: applyItemsDelta(s.items, event.set, event.del), updatedAt: event.at } : s,
        ),
      };
    }
    case 'book_upsert':
      return { sessions };
  }
}

/** Aplica um `book_upsert` à lista de talões abertos do TalaoProvider (que
 * só guarda `status === 'aberto'`, ver fetchOrderBooks('aberto')) — um
 * talão que deixou de estar aberto some da lista, igual um refetch mostraria. */
export function applyBookUpsert(books: OrderBook[], book: OrderBook): OrderBook[] {
  if (book.status !== 'aberto') return books.filter((b) => b.id !== book.id);
  const exists = books.some((b) => b.id === book.id);
  const next = exists ? books.map((b) => (b.id === book.id ? book : b)) : [...books, book];
  // isActive é exclusivo por vendedora (mesmo padrão de selectBook).
  return book.isActive ? next.map((b) => (b.id === book.id ? b : { ...b, isActive: false })) : next;
}

export interface ActiveApplyResult {
  session: OrderSession | null;
  resync: boolean;
}

/** Aplica um evento à sessão única de uma cliente (ClientSessionProvider). */
export function applySessionEventToActive(active: OrderSession | null, event: RealtimeEvent): ActiveApplyResult {
  switch (event.t) {
    case 'session_created': {
      if (!active) return { session: event.session, resync: false };
      if (active.id !== event.session.id || isStale(active.updatedAt, event.at)) return { session: active, resync: false };
      return { session: { ...active, ...event.session }, resync: false };
    }
    case 'session_patch': {
      if (!active || active.id !== event.sid || isStale(active.updatedAt, event.at)) return { session: active, resync: false };
      return { session: { ...active, ...event.patch }, resync: false };
    }
    case 'session_items': {
      if (!active || active.id !== event.sid) return { session: active, resync: false };
      if (active.updatedAt !== event.prev) return { session: active, resync: true };
      return {
        session: { ...active, items: applyItemsDelta(active.items, event.set, event.del), updatedAt: event.at },
        resync: false,
      };
    }
    case 'book_upsert':
      return { session: active, resync: false };
  }
}
