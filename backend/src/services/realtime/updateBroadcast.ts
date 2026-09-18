import type { CartItem, Order, OrderBook, OrderSession } from "@/lib/types";
import type { RealtimeEvent, RealtimeUpdate } from "@/contracts/realtime";
import type { UpdatesNamespace } from "@/realtime/types";

// Reexportado pra não quebrar quem já importava daqui; a definição virou
// contrato compartilhado com o frontend (@/contracts/realtime).
export type { RealtimeUpdate };

const globalForRealtimeUpdates = globalThis as unknown as {
    __updatesNamespace?: UpdatesNamespace;
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

// Notificação (notificationModel) é sempre endereçada a um user_id
// específico, não a um papel — administrador/expedição/entregador não
// dividem a mesma fila de notificações como dividem a fila de pedidos
// (tenantRoom). Toda role entra na própria userRoom (ver
// updatesRoomsForUser abaixo), então "notifications_updated" sempre chega
// só a quem de fato recebeu aquela notificação.
function userRoom(tenantId: string, userId: string): string {
    return `updates:user:${tenantId}:${userId}`;
}

export function updatesRoomsForUser(tenantId: string, user: { id: string; role: string; clientId?: string }): string[] {
    // userRoom entra pra toda role, sempre — é onde "notifications_updated"
    // é emitido (ver notifyUserNotification), e notificação é por user_id,
    // não por papel/sessão/talão.
    const rooms = [userRoom(tenantId, user.id)];
    if (user.role === "vendedora") return [...rooms, sellerRoom(tenantId, user.id)];
    if (user.role === "cliente") {
        // Sem clientId não há como escopar a clientRoom a uma única cliente —
        // cair no tenantRoom (como antes) vazaria toda a fila da loja pra
        // ela. Ver updateBroadcast.test.ts. A userRoom continua valendo
        // (notificações são por user_id, não afetadas por esse bloqueador).
        return user.clientId ? [...rooms, clientRoom(tenantId, user.clientId)] : rooms;
    }
    // administrador/expedição/entregador: veem a fila do tenant inteiro (ver
    // orderSessions/userOrders), mas talões (order-books) são sempre
    // escopados ao próprio vendedor mesmo pra quem tem adminAccess (ver
    // orderBookService.ts) — por isso também entram na própria sellerRoom,
    // senão nunca receberiam os `book_upsert` dos talões que eles mesmos
    // possuem quando estão usando o talão como vendedora.
    return [...rooms, tenantRoom(tenantId), sellerRoom(tenantId, user.id)];
}

export function registerUpdatesNamespace(namespace: UpdatesNamespace): void {
    globalForRealtimeUpdates.__updatesNamespace = namespace;
}

/** Sinal sem dados — mantido pro consumo legado (workspace/, /pedidos, tela
 * de pedidos) que ainda reage a ele com refetch. Ver plano de realtime
 * incremental: só TalaoProvider/ClientSessionProvider migraram pro evento
 * com payload abaixo. */
function emitSignal(rooms: string[], update: RealtimeUpdate): void {
    if (rooms.length === 0) return;
    globalForRealtimeUpdates.__updatesNamespace?.to(rooms).emit("atualizacao", { type: update });
}

/** Evento tipado com payload, canal novo — quem escuta aplica incrementalmente
 * em vez de refazer fetch. */
function emitEvent(rooms: string[], event: RealtimeEvent): void {
    if (rooms.length === 0) return;
    globalForRealtimeUpdates.__updatesNamespace?.to(rooms).emit("atualizacao_v2", event);
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

// União de rooms (`io.to([a, b]).emit(...)`) em vez de um emit por room: o
// Socket.IO entrega UMA vez a cada socket mesmo que ele esteja em várias das
// rooms da lista (ver documents/knowledge/socket.io/doc/rooms.md). Isso não é
// só economia de pacote — administrador/expedição/entregador estão ao mesmo
// tempo no tenantRoom E na própria sellerRoom (updatesRoomsForUser acima),
// então o emit separado entregava o MESMO evento duas vezes pra eles.
function broadcastSessionSignal(tenantId: string, session: Pick<OrderSession, "sellerId" | "clientId">): void {
    const rooms = [tenantRoom(tenantId), sellerRoom(tenantId, session.sellerId)];
    if (session.clientId) rooms.push(clientRoom(tenantId, session.clientId));
    emitSignal(rooms, "sessions_updated");
}

/** Sessão nova entrando no escopo de quem escuta (criada pela vendedora ou
 * pela cliente) — o cliente deve inserir no array, não só tentar dar patch
 * numa entrada que ainda não existe. */
export function notifySessionCreated(tenantId: string, session: OrderSession): void {
    broadcastSessionSignal(tenantId, session);
    const event: RealtimeEvent = { t: "session_created", at: session.updatedAt, session };
    emitEvent([tenantRoom(tenantId), sellerRoom(tenantId, session.sellerId)], event);
    // clientRoom fica FORA da união acima de propósito: o payload dela é
    // outro (sem `notes`). Nenhum socket está nas duas listas — quem tem
    // clientRoom é role "cliente", que nunca entra no tenantRoom nem em
    // sellerRoom (updatesRoomsForUser) —, então não há entrega duplicada.
    if (session.clientId) {
        const clientSession = omit(session, ["notes"]);
        emitEvent([clientRoom(tenantId, session.clientId)], { ...event, session: clientSession as OrderSession });
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
        // Payload idêntico pras três rooms (o diff de item não tem campo
        // sensível a filtrar), então uma união só resolve.
        const itemsRooms = [tenantRoom(tenantId), sellerRoom(tenantId, session.sellerId)];
        if (session.clientId) itemsRooms.push(clientRoom(tenantId, session.clientId));
        emitEvent(itemsRooms, itemsEvent);
    }

    if (options?.skipPatch) return;

    const patch = sessionPatchFrom(session);
    const event: RealtimeEvent = { t: "session_patch", sid: session.id, at: session.updatedAt, patch };
    emitEvent([tenantRoom(tenantId), sellerRoom(tenantId, session.sellerId)], event);
    // Idem session_created: a cliente recebe o patch sem `notes`, por isso
    // não entra na união.
    if (session.clientId) emitEvent([clientRoom(tenantId, session.clientId)], { ...event, patch: forClientRoom(patch) });
}

export function notifyOrderBook(tenantId: string, book: OrderBook): void {
    emitSignal([tenantRoom(tenantId), sellerRoom(tenantId, book.sellerId)], "order_books_updated");
    // Payload só pra sellerRoom — GET /order-books é sempre escopado ao
    // próprio vendedor (orderBookService.ts), inclusive pra quem tem
    // adminAccess; não existe endpoint HTTP de "talões de outra pessoa", e o
    // tenantRoom tem admin/expedição/entregador. Empurrar o objeto completo
    // ali seria vazamento novo.
    emitEvent([sellerRoom(tenantId, book.sellerId)], { t: "book_upsert", book });
}

export function notifyOrder(tenantId: string, order: Pick<Order, "sellerId" | "clientId">): void {
    const rooms = [tenantRoom(tenantId)];
    if (order.sellerId) rooms.push(sellerRoom(tenantId, order.sellerId));
    if (order.clientId) rooms.push(clientRoom(tenantId, order.clientId));
    emitSignal(rooms, "orders_updated");
}

/** Uma notificação nova foi enfileirada pra este usuário (ver
 * enqueueNotification em pushNotificationService.ts) — sinal sem payload,
 * NotificationCenter reage refazendo GET /api/notifications/summary em vez
 * de fazer polling a cada 60s pra descobrir isso. */
export function notifyUserNotification(tenantId: string, userId: string): void {
    emitSignal([userRoom(tenantId, userId)], "notifications_updated");
}
