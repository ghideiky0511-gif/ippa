import type { Namespace } from "socket.io";
import type { Order, OrderBook, OrderSession } from "@/lib/types";

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
    if (user.role === "cliente" && user.clientId) return [clientRoom(tenantId, user.clientId)];
    return [tenantRoom(tenantId)];
}

export function registerUpdatesNamespace(namespace: Namespace): void {
    globalForRealtimeUpdates.__updatesNamespace = namespace;
}

function emit(room: string, update: RealtimeUpdate): void {
    globalForRealtimeUpdates.__updatesNamespace?.to(room).emit("atualizacao", { type: update });
}

/** Sinal sem dados: cada tela atualiza via API dentro de suas permissões. */
export function notifySession(tenantId: string, session: Pick<OrderSession, "sellerId" | "clientId">): void {
    emit(tenantRoom(tenantId), "sessions_updated");
    emit(sellerRoom(tenantId, session.sellerId), "sessions_updated");
    if (session.clientId) emit(clientRoom(tenantId, session.clientId), "sessions_updated");
}

export function notifyOrderBook(tenantId: string, book: Pick<OrderBook, "sellerId">): void {
    emit(tenantRoom(tenantId), "order_books_updated");
    emit(sellerRoom(tenantId, book.sellerId), "order_books_updated");
}

export function notifyOrder(tenantId: string, order: Pick<Order, "sellerId" | "clientId">): void {
    emit(tenantRoom(tenantId), "orders_updated");
    if (order.sellerId) emit(sellerRoom(tenantId, order.sellerId), "orders_updated");
    if (order.clientId) emit(clientRoom(tenantId, order.clientId), "orders_updated");
}
