import type { Namespace } from "socket.io";
import type { CartItem, Order, OrderBook, OrderSession } from "@/lib/types";
import type { RealtimeEvent } from "@/contracts/realtime";

export type RealtimeUpdate = "sessions_updated" | "orders_updated" | "order_books_updated";

const globalForRealtimeUpdates = globalThis as unknown as {
    __updatesNamespace?: Namespace;
};

function tenantRoom(tenantId: string): string {
    return `updates:tenant:${tenantId}`;
}

function sellerRoom(tenantId: string, sellerId: string): string {
    return `updates:seller:${tenantId}:${sellerId}`;
}

function clientRoom(tenantId: string, clientId: string): string {
    return `updates:client:${tenantId}:${clientId}`;
}

export function updatesRoomsForUser(tenantId: string, user: { id: string; role: string; clientId?: string }): string[] {
    if (user.role === "vendedora") return [sellerRoom(tenantId, user.id)];
    if (user.role === "cliente") {
        // Sem clientId não há como escopar a room a uma única cliente — cair
        // no tenantRoom (como antes) vazaria toda a fila da loja pra ela.
        // Ver updateBroadcast.test.ts.
        return user.clientId ? [clientRoom(tenantId, user.clientId)] : [];
    }
    // administrador/expedição/entregador: veem a fila do tenant inteiro (ver
    // orderSessions/userOrders), mas talões (order-books) são sempre
    // escopados ao próprio vendedor mesmo pra quem tem adminAccess (ver
    // orderBookService.ts) — por isso também entram na própria sellerRoom,
    // senão nunca receberiam os `book_upsert` dos talões que eles mesmos
    // possuem quando estão usando o talão como vendedora.
    return [tenantRoom(tenantId), sellerRoom(tenantId, user.id)];
}

export function registerUpdatesNamespace(namespace: Namespace): void {
    globalForRealtimeUpdates.__updatesNamespace = namespace;
}

/** Sinal sem dados — mantido pro consumo legado (workspace/, /pedidos, tela
 * de pedidos) que ainda reage a ele com refetch. Ver plano de realtime
 * incremental: só TalaoProvider/ClientSessionProvider migraram pro evento
 * com payload abaixo. */
function emitSignal(room: string, update: RealtimeUpdate): void {
    globalForRealtimeUpdates.__updatesNamespace?.to(room).emit("atualizacao", { type: update });
}

/** Evento tipado com payload, canal novo — quem escuta aplica incrementalmente
 * em vez de refazer fetch. */
function emitEvent(room: string, event: RealtimeEvent): void {
    globalForRealtimeUpdates.__updatesNamespace?.to(room).emit("atualizacao_v2", event);
}

function omit<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Omit<T, K> {
    const clone: T = { ...obj };
    for (const key of keys) delete clone[key];
    return clone;
}

function sessionPatchFrom(session: OrderSession): Record<string, unknown> {
    // items nunca entra no patch — o caso quente de item tem seu próprio
    // evento (session_items) com diff; aqui os itens ficam de fora mesmo
    // quando o objeto de origem os carrega errado (ex.: sessão fechada por
    // reconciliação, ver notifyReconciledSessions em orderSessionService.ts).
    // paymentToken também nunca aparece: toOrderSession já não o preenche
    // (orderMapper.ts) — é o que impede o token do link de cobrança de
    // vazar pra quem está na room, e este omit preserva essa garantia.
    return omit(session, ["id", "items"]);
}

// notes é anotação livre da vendedora — não deve chegar na tela da cliente.
function forClientRoom<T extends { notes?: string }>(patch: T): Omit<T, "notes"> {
    return omit(patch, ["notes"]);
}

function broadcastSessionSignal(tenantId: string, session: Pick<OrderSession, "sellerId" | "clientId">): void {
    emitSignal(tenantRoom(tenantId), "sessions_updated");
    emitSignal(sellerRoom(tenantId, session.sellerId), "sessions_updated");
    if (session.clientId) emitSignal(clientRoom(tenantId, session.clientId), "sessions_updated");
}

/** Sessão nova entrando no escopo de quem escuta (criada pela vendedora ou
 * pela cliente) — o cliente deve inserir no array, não só tentar dar patch
 * numa entrada que ainda não existe. */
export function notifySessionCreated(tenantId: string, session: OrderSession): void {
    broadcastSessionSignal(tenantId, session);
    const event: RealtimeEvent = { t: "session_created", at: session.updatedAt, session };
    emitEvent(tenantRoom(tenantId), event);
    emitEvent(sellerRoom(tenantId, session.sellerId), event);
    if (session.clientId) {
        const clientSession = omit(session, ["notes"]);
        emitEvent(clientRoom(tenantId, session.clientId), { ...event, session: clientSession as OrderSession });
    }
}

/**
 * Qualquer alteração de sessão já existente. `session` precisa ser o estado
 * JÁ salvo (updatedAt pós-mutação) — é o que sustenta a guarda monotônica no
 * cliente (nunca deixa um evento mais velho sobrescrever um mais novo,
 * venha de onde vier: /pedidos ou /atualizacoes).
 *
 * `itemsDelta`, quando informado, também emite o caso quente (item
 * add/remove/qty) como evento separado e minúsculo em vez de embutir os
 * itens no patch — é o único call-site que precisa disso hoje
 * (orderSessionService.updateSession).
 *
 * `skipPatch: true` pula o session_patch — só faz sentido junto de
 * `itemsDelta` quando NENHUM outro campo mudou nesta chamada (ex.: "+1
 * peça"): sem isso, todo clique reafirmaria clientName/shipping/notes/etc
 * sem necessidade, contra o pedido explícito de manter o caminho quente
 * barato e com poucos dados.
 */
export function notifySession(
    tenantId: string,
    session: OrderSession,
    itemsDelta?: { prevUpdatedAt: string; set: CartItem[]; del: string[] },
    options?: { skipPatch?: boolean },
): void {
    broadcastSessionSignal(tenantId, session);

    if (itemsDelta) {
        const itemsEvent: RealtimeEvent = {
            t: "session_items",
            sid: session.id,
            prev: itemsDelta.prevUpdatedAt,
            at: session.updatedAt,
            set: itemsDelta.set,
            del: itemsDelta.del,
        };
        emitEvent(tenantRoom(tenantId), itemsEvent);
        emitEvent(sellerRoom(tenantId, session.sellerId), itemsEvent);
        if (session.clientId) emitEvent(clientRoom(tenantId, session.clientId), itemsEvent);
    }

    if (options?.skipPatch) return;

    const patch = sessionPatchFrom(session);
    const event: RealtimeEvent = { t: "session_patch", sid: session.id, at: session.updatedAt, patch };
    emitEvent(tenantRoom(tenantId), event);
    emitEvent(sellerRoom(tenantId, session.sellerId), event);
    if (session.clientId) emitEvent(clientRoom(tenantId, session.clientId), { ...event, patch: forClientRoom(patch) });
}

export function notifyOrderBook(tenantId: string, book: OrderBook): void {
    emitSignal(tenantRoom(tenantId), "order_books_updated");
    emitSignal(sellerRoom(tenantId, book.sellerId), "order_books_updated");
    // Payload só pra sellerRoom — GET /order-books é sempre escopado ao
    // próprio vendedor (orderBookService.ts), inclusive pra quem tem
    // adminAccess; não existe endpoint HTTP de "talões de outra pessoa", e o
    // tenantRoom tem admin/expedição/entregador. Empurrar o objeto completo
    // ali seria vazamento novo.
    emitEvent(sellerRoom(tenantId, book.sellerId), { t: "book_upsert", book });
}

export function notifyOrder(tenantId: string, order: Pick<Order, "sellerId" | "clientId">): void {
    emitSignal(tenantRoom(tenantId), "orders_updated");
    if (order.sellerId) emitSignal(sellerRoom(tenantId, order.sellerId), "orders_updated");
    if (order.clientId) emitSignal(clientRoom(tenantId, order.clientId), "orders_updated");
}
