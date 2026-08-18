import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, Order, OrderSession } from "@/lib/types";
import {
    findLatestOpenOrderSessionRowByClient,
    findOrderSessionRow,
    insertOrderSessionItemRow,
    insertOrderSessionRow,
    insertOrderItemRow,
    listOrderSessionItemRowsBySession,
    listOrderSessionItemRows,
    listOrderSessionRowsBySeller,
    listTenantOrderSessionRows,
    replaceOrderSessionItemRows,
    updateOrderSessionRow,
    closeOrderSessionRow,
    insertOrderRow,
} from "@/models/ordersModel";
import { findClientRow, updateClientRow } from "@/models/clientsModel";
import { findUserRowById } from "@/models/usersModel";
import { recordAuditEvent, ORDER_SESSION_AUDIT_ACTIONS, type AuditRequestContext } from "@/services/audit";
import { ForbiddenError, NotFoundError, ValidationError } from "@/services/shared/errors";
import { notifySession } from "@/lib/sseHub";
import { notifyOrder } from "@/lib/sseHub";
import { findActiveOrderBookRow, findOrderBookRow, insertOrderBookRow } from "@/models/orderBooksModel";
import { toOrder, toOrderSession } from "./orderMapper";

function canManageSession(user: AuthUser, sellerId: string): boolean {
    return user.role !== "cliente" && (user.role !== "vendedora" || sellerId === user.id);
}

export async function orderSessions(tenant: Tenant, user: AuthUser): Promise<OrderSession[]> {
    if (user.role === "cliente") throw new ForbiddenError();
    return withTenantTransaction(tenant, user, async (client) => {
        const [sessions, items] = await Promise.all([
            user.role === "vendedora"
                ? listOrderSessionRowsBySeller(client, user.id)
                : listTenantOrderSessionRows(client),
            listOrderSessionItemRows(client),
        ]);
        return sessions.map((session) => toOrderSession(
            session,
            items.filter((item) => item.session_id === session.id).map((item) => item.snapshot),
        ));
    });
}

// MantÃ©m o nome anterior para o talÃ£o pÃºblico e integraÃ§Ãµes jÃ¡ existentes.
export const sellerSessions = orderSessions;

export async function customerActiveSession(tenant: Tenant, user: AuthUser): Promise<OrderSession | null> {
    if (user.role !== "cliente" || !user.clientId) throw new ForbiddenError();
    return withTenantTransaction(tenant, user, async (client) => {
        const row = await findLatestOpenOrderSessionRowByClient(client, user.clientId!);
        if (!row) return null;
        const [items, seller] = await Promise.all([
            listOrderSessionItemRowsBySession(client, row.id),
            findUserRowById(client, row.seller_id),
        ]);
        return { ...toOrderSession(row, items.map((item) => item.snapshot)), sellerName: seller?.name };
    });
}

export async function createOrderSession(
    tenant: Tenant,
    user: AuthUser,
    body: Partial<OrderSession>,
    context: AuditRequestContext,
): Promise<OrderSession> {
    if (user.role === "cliente") throw new ForbiddenError();
    const created = await withTenantTransaction(tenant, user, async (client) => {
        const items = Array.isArray(body.items) ? body.items : [];
        const requestedBookId = typeof body.orderBookId === "string" && body.orderBookId
            ? body.orderBookId
            : undefined;
        const book = requestedBookId
            ? await findOrderBookRow(client, requestedBookId)
            : (await findActiveOrderBookRow(client, user.id)) ?? await insertOrderBookRow(client, user.id, "Talão atual");
        if (!book) throw new NotFoundError("ORDER_BOOK_NOT_FOUND");
        if (book.seller_id !== user.id || book.status !== "aberto") throw new ForbiddenError();
        const requestedClientId = typeof body.clientId === "string" && body.clientId
            ? body.clientId
            : undefined;
        const registration = requestedClientId
            ? await findClientRow(client, requestedClientId)
            : null;
        if (requestedClientId && !registration) throw new NotFoundError("CLIENT_NOT_FOUND");
        const row = await insertOrderSessionRow(client, {
            orderBookId: book.id,
            clientName: registration?.name ?? (typeof body.clientName === "string" && body.clientName.trim()
                ? body.clientName.trim() : "Sem cliente"),
            clientId: registration?.id,
            sellerId: user.id,
            channel: body.channel === "whatsapp" || body.channel === "online" ? body.channel : "presencial",
            status: "aberto",
            shipping: undefined,
            notes: body.notes,
        });
        for (const item of items) await insertOrderSessionItemRow(client, row.id, item);
        const created = toOrderSession(row, items);
        await recordAuditEvent(client, {
            action: ORDER_SESSION_AUDIT_ACTIONS.CREATED,
            entityId: created.id,
            actor: user,
            context,
            metadata: {
                channel: created.channel,
                orderBookId: created.orderBookId,
                hasClient: Boolean(created.clientId),
                itemCount: created.items.length,
            },
        });
        return created;
    });
    notifySession(tenant.id, created);
    return created;
}

// Nome mantido para nÃ£o quebrar chamadas antigas do talÃ£o pÃºblico.
export const createSellerSession = createOrderSession;

export async function updateSession(
    tenant: Tenant,
    user: AuthUser,
    id: string,
    body: Partial<OrderSession> & { shipping?: unknown },
): Promise<OrderSession> {
    const updated = await withTenantTransaction(tenant, user, async (client) => {
        const currentRow = await findOrderSessionRow(client, id);
        if (!currentRow) throw new NotFoundError("SESSION_NOT_FOUND");
        const currentItems = (await listOrderSessionItemRowsBySession(client, id)).map((item) => item.snapshot);
        const isSeller = canManageSession(user, currentRow.seller_id);
        const isClient = user.role === "cliente" && Boolean(currentRow.client_id) && currentRow.client_id === user.clientId;
        if (!isSeller && !isClient) throw new ForbiddenError();

        let clientId = currentRow.client_id ?? undefined;
        let clientName = currentRow.client_name;
        let notes = currentRow.notes ?? undefined;
        let status = currentRow.status;
        if (isSeller) {
            if (typeof body.clientId === "string" && body.clientId) {
                const registration = await findClientRow(client, body.clientId);
                if (!registration) throw new NotFoundError("CLIENT_NOT_FOUND");
                clientId = registration.id;
                clientName = registration.name;
                await updateClientRow(client, registration.id, {
                    name: registration.name,
                    cpfCnpj: registration.cpf_cnpj ?? undefined,
                    email: registration.email ?? undefined,
                    cep: registration.cep ?? undefined,
                    street: registration.street ?? undefined,
                    number: registration.number ?? undefined,
                    complement: registration.complement ?? undefined,
                    neighborhood: registration.neighborhood ?? undefined,
                    city: registration.city ?? undefined,
                    state: registration.state ?? undefined,
                    companyResponsible: registration.company_responsible ?? undefined,
                    storeName: registration.store_name ?? undefined,
                    lastSellerId: currentRow.seller_id,
                });
            }
            if (typeof body.notes === "string") notes = body.notes;
            if (body.status !== undefined) {
                if (!(["aberto", "fechado", "aguardando_pagamento"] as unknown[]).includes(body.status)) {
                    throw new ValidationError();
                }
                status = body.status;
            }
        }
        let shipping = currentRow.shipping ?? undefined;
        if (body.shipping === null) shipping = undefined;
        else if (body.shipping && typeof body.shipping === "object" &&
            typeof (body.shipping as { price?: unknown }).price === "number") shipping = body.shipping as OrderSession["shipping"];
        const items = Array.isArray(body.items) ? body.items : currentItems;
        if (Array.isArray(body.items)) await replaceOrderSessionItemRows(client, id, items);
        const row = await updateOrderSessionRow(client, id, {
            clientName, clientId, notes, status, shipping,
            clearPaymentToken: status === "aberto" && currentRow.status !== "aberto",
        });
        if (!row) throw new NotFoundError("SESSION_NOT_FOUND");
        return toOrderSession(row, items);
    });
    notifySession(tenant.id, updated);
    return updated;
}

export async function canAccessOrderSession(
    tenant: Tenant,
    user: AuthUser,
    id: string,
): Promise<boolean> {
    return withTenantTransaction(tenant, user, async (client) => {
        const session = await findOrderSessionRow(client, id);
        if (!session) return false;
        if (user.role === "cliente") return session.client_id === user.clientId;
        return canManageSession(user, session.seller_id);
    });
}

export async function finalizeOrderSession(
    tenant: Tenant,
    user: AuthUser,
    id: string,
    body: { paymentMethod?: unknown },
): Promise<Order> {
    if (user.role === "cliente") throw new ForbiddenError();
    let changedSession: OrderSession | undefined;
    const order = await withTenantTransaction(tenant, user, async (client) => {
        const session = await findOrderSessionRow(client, id);
        if (!session) throw new NotFoundError("SESSION_NOT_FOUND");
        if (!canManageSession(user, session.seller_id)) throw new ForbiddenError();
        if (session.status === "fechado") throw new ValidationError("SESSION_ALREADY_FINALIZED");
        if (!session.client_id) throw new ValidationError("CLIENT_REQUIRED");

        const items = (await listOrderSessionItemRowsBySession(client, id))
            .map((item) => item.snapshot)
            .filter((item) => item.qty > 0);
        if (items.length === 0) throw new ValidationError("EMPTY_ORDER");

        const total = items.reduce((sum, item) => sum + item.price * item.qty, 0)
            + (session.shipping?.price ?? 0);
        const row = await insertOrderRow(client, {
            clientId: session.client_id,
            sellerId: session.seller_id,
            clientName: session.client_name,
            channel: session.channel,
            total,
            shipping: session.shipping ?? undefined,
            paymentMethod: typeof body.paymentMethod === "string"
                ? body.paymentMethod
                : undefined,
        });
        for (const item of items) await insertOrderItemRow(client, row.id, item);
        const closed = await closeOrderSessionRow(client, session.id);
        if (closed) changedSession = toOrderSession(closed, items);
        return toOrder(row, items);
    });
    if (changedSession) notifySession(tenant.id, changedSession);
    notifyOrder(tenant.id, order);
    return order;
}
