import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, OrderBook, OrderSession } from "@/lib/types";
import {
    activateOrderBookRow,
    closeOrderBookRow,
    findActiveOrderBookRow,
    findOrderBookRow,
    insertOrderBookRow,
    listOrderBookRowsBySeller,
} from "@/models/orderBooksModel";
import { cancelOpenOrderSessionRowsByBook } from "@/models/ordersModel";
import { ForbiddenError, NotFoundError, ValidationError } from "@/services/shared/errors";
import { notifyOrderBook, notifySession } from "@/services/realtime/updateBroadcast";
import { toOrderBook, toOrderSession } from "./orderMapper";
import { getOrderBookSessionState } from "./orderBookLifecycle";
import { CreateOrderBookInputSchema } from "@/contracts/orders";

function requireInternal(user: AuthUser) {
    if (user.role === "cliente") throw new ForbiddenError();
}

export async function orderBooks(tenant: Tenant, user: AuthUser, status?: OrderBook["status"]): Promise<OrderBook[]> {
    requireInternal(user);
    return withTenantTransaction(tenant, user, async (client) =>
        (await listOrderBookRowsBySeller(client, user.id, status)).map(toOrderBook),
    );
}

export async function activeOrderBook(tenant: Tenant, user: AuthUser): Promise<OrderBook> {
    requireInternal(user);
    let created = false;
    const book = await withTenantTransaction(tenant, user, async (client) => {
        const active = await findActiveOrderBookRow(client, user.id);
        if (active) return active;
        created = true;
        return insertOrderBookRow(client, user.id, "Talão atual");
    });
    const result = toOrderBook(book);
    // Get-or-create: só notifica quando de fato criou um talão novo — o
    // caminho "achou o ativo" é leitura pura (chamado toda vez que a
    // vendedora abre o talão) e não deve gerar ruído de broadcast.
    if (created) notifyOrderBook(tenant.id, result);
    return result;
}

export async function createOrderBook(tenant: Tenant, user: AuthUser, rawBody: unknown): Promise<OrderBook> {
    requireInternal(user);
    const parsed = CreateOrderBookInputSchema.safeParse(rawBody);
    if (!parsed.success) throw new ValidationError("INVALID_INPUT", "Dados inválidos.", parsed.error.issues);
    const name = parsed.data.name?.trim() ?? "";
    if (!name) throw new ValidationError("ORDER_BOOK_NAME_REQUIRED");
    const book = toOrderBook(await withTenantTransaction(tenant, user, (client) => insertOrderBookRow(client, user.id, name)));
    notifyOrderBook(tenant.id, book);
    return book;
}

export async function activateOrderBook(tenant: Tenant, user: AuthUser, id: string): Promise<OrderBook> {
    requireInternal(user);
    const book = await withTenantTransaction(tenant, user, async (client) => {
        const existing = await findOrderBookRow(client, id);
        if (!existing) throw new NotFoundError("ORDER_BOOK_NOT_FOUND");
        if (existing.seller_id !== user.id) throw new ForbiddenError();
        const activated = await activateOrderBookRow(client, id, user.id);
        if (!activated) throw new NotFoundError("ORDER_BOOK_NOT_FOUND");
        return activated;
    });
    const result = toOrderBook(book);
    notifyOrderBook(tenant.id, result);
    return result;
}

export async function cancelOrderBook(tenant: Tenant, user: AuthUser, id: string): Promise<OrderBook> {
    requireInternal(user);
    let cancelledSessions: OrderSession[] = [];
    const book = await withTenantTransaction(tenant, user, async (client) => {
        const existing = await findOrderBookRow(client, id);
        if (!existing) throw new NotFoundError("ORDER_BOOK_NOT_FOUND");
        if (existing.seller_id !== user.id) throw new ForbiddenError();
        if (existing.status !== "aberto") throw new ValidationError("ORDER_BOOK_ALREADY_CLOSED");

        const state = await getOrderBookSessionState(client, id);
        if (!state.allCancellableSessionsEmpty) throw new ValidationError("ORDER_BOOK_NOT_EMPTY");

        const rows = await cancelOpenOrderSessionRowsByBook(client, id);
        cancelledSessions = rows.map((row) => toOrderSession(row, state.itemsBySession.get(row.id) ?? []));
        const closed = await closeOrderBookRow(client, id);
        if (!closed) throw new NotFoundError("ORDER_BOOK_NOT_FOUND");
        return closed;
    });
    for (const session of cancelledSessions) notifySession(tenant.id, session);
    const result = toOrderBook(book);
    notifyOrderBook(tenant.id, result);
    return result;
}

export async function canUseOrderBook(tenant: Tenant, user: AuthUser, id: string): Promise<boolean> {
    if (user.role === "cliente") return false;
    return withTenantTransaction(tenant, user, async (client) => {
        const book = await findOrderBookRow(client, id);
        return Boolean(book && book.seller_id === user.id && book.status === "aberto");
    });
}
