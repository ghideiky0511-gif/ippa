import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, Order, OrderSession, OrderSessionParticipant } from "@/lib/types";
import {
    findLatestOpenOrderSessionRowByClient,
    findOrderSessionRow,
    insertOrderSessionItemRow,
    insertOrderSessionRow,
    findOrderRowById,
    listOrderItemRowsByOrder,
    listOrderSessionItemRowsBySession,
    listOrderSessionItemRows,
    listOrderSessionRowsBySeller,
    listTenantOrderSessionRows,
    replaceOrderSessionItemRows,
    updateOrderSessionRow,
    updateOrderRow,
    closeOrderSessionRow,
} from "@/models/ordersModel";
import { getOrCreateOpenOrder, syncOrderItems } from "./orderItemSync";
import {
    listOrderSessionParticipantRows,
    markOrderSessionParticipantLeftRow,
    upsertOrderSessionParticipantRow,
} from "@/models/orderSessionParticipantsModel";
import { findClientRow, updateClientRow } from "@/models/clientsModel";
import { findUserRowById } from "@/models/usersModel";
import { listUsersByIds } from "@/services/users";
import { recordAuditEvent, ORDER_SESSION_AUDIT_ACTIONS, type AuditRequestContext } from "@/services/audit";
import { ForbiddenError, NotFoundError, ValidationError } from "@/services/shared/errors";
import { notifyOrder, notifyOrderBook, notifySession } from "@/lib/sseHub";
import { scheduleSessionBroadcast } from "@/services/realtime/sessionBroadcast";
import { findActiveOrderBookRow, findOrderBookRow, insertOrderBookRow, reopenOrderBookRow, type OrderBookRow } from "@/models/orderBooksModel";
import { closeOrderBookWhenFinished } from "./orderBookLifecycle";
import { toOrder, toOrderSession } from "./orderMapper";

function canManageSession(user: AuthUser, sellerId: string): boolean {
    return user.role !== "cliente" && (user.role !== "vendedora" || sellerId === user.id);
}

function toParticipant(
    row: Awaited<ReturnType<typeof listOrderSessionParticipantRows>>[number],
    usersById: Map<string, AuthUser>,
): OrderSessionParticipant | null {
    const user = usersById.get(row.user_id);
    if (!user) return null;
    return {
        userId: row.user_id,
        firstJoinedAt: row.first_joined_at.toISOString(),
        lastJoinedAt: row.last_joined_at.toISOString(),
        lastLeftAt: row.last_left_at?.toISOString(),
        joinCount: row.join_count,
        user: { id: user.id, name: user.name, role: user.role },
    };
}

export async function sessionParticipants(
    tenant: Tenant,
    actor: AuthUser,
    sessionId: string,
): Promise<OrderSessionParticipant[]> {
    return withTenantTransaction(tenant, actor, async (client) => {
        const session = await findOrderSessionRow(client, sessionId);
        if (!session) throw new NotFoundError("SESSION_NOT_FOUND");
        const allowed = actor.role === "cliente"
            ? session.client_id === actor.clientId
            : canManageSession(actor, session.seller_id);
        if (!allowed) throw new ForbiddenError();
        const rows = await listOrderSessionParticipantRows(client, sessionId);
        const usersById = new Map((await listUsersByIds(client, rows.map((row) => row.user_id)))
            .map((user) => [user.id, user]));
        return rows.map((row) => toParticipant(row, usersById)).filter((row): row is OrderSessionParticipant => Boolean(row));
    });
}

export async function registerSessionParticipant(
    tenant: Tenant,
    actor: AuthUser,
    sessionId: string,
): Promise<void> {
    await withTenantTransaction(tenant, actor, async (client) => {
        await upsertOrderSessionParticipantRow(client, sessionId, actor.id);
    });
}

export async function leaveSessionParticipant(
    tenant: Tenant,
    actor: AuthUser,
    sessionId: string,
): Promise<void> {
    await withTenantTransaction(tenant, actor, async (client) => {
        await markOrderSessionParticipantLeftRow(client, sessionId, actor.id);
    });
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
        const clientName = registration?.name ?? (typeof body.clientName === "string" && body.clientName.trim()
            ? body.clientName.trim() : "Sem cliente");
        const channel = body.channel === "whatsapp" || body.channel === "online" ? body.channel : "presencial";
        // Upsell: cliente com pedido em aberto pra essa mesma vendedora
        // reaproveita o pedido; sem clientId (registro "Sem cliente"), não
        // há como localizar um pedido depois, então cada sessão fica solta.
        const order = await getOrCreateOpenOrder(client, { clientId: registration?.id, sellerId: user.id, clientName, channel });
        const row = await insertOrderSessionRow(client, {
            orderBookId: book.id,
            orderId: order?.id,
            clientName,
            clientId: registration?.id,
            sellerId: user.id,
            channel,
            status: "aberto",
            shipping: undefined,
            notes: body.notes,
        });
        for (const item of items) await insertOrderSessionItemRow(client, row.id, item);
        if (order && items.length > 0) {
            await syncOrderItems(client, { orderId: order.id, currentItems: [], nextItems: items, actorId: user.id, actorRole: user.role });
        }
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
    scheduleSessionBroadcast(created);
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
    const changes: { book?: OrderBookRow } = {};
    const updated = await withTenantTransaction(tenant, user, async (client) => {
        const currentRow = await findOrderSessionRow(client, id);
        if (!currentRow) throw new NotFoundError("SESSION_NOT_FOUND");
        const currentItems = (await listOrderSessionItemRowsBySession(client, id)).map((item) => item.snapshot);
        const isSeller = canManageSession(user, currentRow.seller_id);
        const isClient = user.role === "cliente" && Boolean(currentRow.client_id) && currentRow.client_id === user.clientId;
        if (!isSeller && !isClient) throw new ForbiddenError();
        // Um pedido cancelado fica preservado para consulta, mas nao pode
        // continuar recebendo alteracoes. Somente quem o gerencia pode
        // devolve-lo ao talão, explicitamente como "aberto".
        if (currentRow.status === "cancelado" &&
            (!isSeller || body.status !== "aberto")) {
            throw new ValidationError("SESSION_CANCELLED");
        }

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
                if (!(["aberto", "fechado", "aguardando_pagamento", "cancelado"] as unknown[]).includes(body.status)) {
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

        // order_id só falta numa sessão que nunca teve cliente vinculado.
        // Se esta chamada é o momento em que o cliente passa a existir
        // (ex. vendedora identifica quem é depois de já ter lançado peças),
        // anexa/cria o pedido agora e sincroniza TUDO que a sessão já tinha
        // -- não só o delta desta chamada, já que nada foi sincronizado
        // antes por não haver pedido pra receber.
        let orderId = currentRow.order_id ?? undefined;
        const justAttached = !orderId && Boolean(clientId);
        if (justAttached) {
            orderId = (await getOrCreateOpenOrder(client, {
                clientId: clientId!, sellerId: currentRow.seller_id, clientName, channel: currentRow.channel,
            }))?.id;
        }
        if (orderId) {
            const order = await findOrderRowById(client, orderId);
            // Pedido já pago/cancelado não aceita mais upsell -- é
            // exatamente o limite de "mutável até pago".
            if (order && (order.status === "pago" || order.status === "cancelado")) {
                throw new ValidationError("ORDER_ALREADY_FINALIZED");
            }
            if (justAttached) {
                await syncOrderItems(client, { orderId, currentItems: [], nextItems: items, actorId: user.id, actorRole: user.role });
            } else if (Array.isArray(body.items)) {
                // Diff é (itens ANTES desta MESMA sessão -> itens depois),
                // não (todo o pedido -> body). Com upsell, o pedido pode ter
                // itens vindos de outra sessão (ex. atendimento fechado
                // antes) que essa sessão nunca viu -- diffar contra o
                // pedido inteiro os interpretaria como "removidos" só por
                // não estarem no body desta chamada.
                await syncOrderItems(client, { orderId, currentItems, nextItems: items, actorId: user.id, actorRole: user.role });
            }
        }
        const row = await updateOrderSessionRow(client, id, {
            clientName, clientId, notes, status, shipping, orderId,
            // Links de pagamento nao sobrevivem a cancelamento nem a uma
            // reativacao: a proxima cobranca precisa gerar um token novo.
            clearPaymentToken: (status === "aberto" && currentRow.status !== "aberto") || status === "cancelado",
        });
        if (!row) throw new NotFoundError("SESSION_NOT_FOUND");
        if (status === "aberto" && currentRow.status !== "aberto") {
            changes.book = (await reopenOrderBookRow(client, row.order_book_id)) ?? undefined;
        } else {
            changes.book = (await closeOrderBookWhenFinished(client, row.order_book_id)) ?? undefined;
        }
        return toOrderSession(row, items);
    });
    notifySession(tenant.id, updated);
    scheduleSessionBroadcast(updated);
    if (changes.book) notifyOrderBook(tenant.id, {
        sellerId: changes.book.seller_id,
    });
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
    const changes: { book?: OrderBookRow } = {};
    const order = await withTenantTransaction(tenant, user, async (client) => {
        const session = await findOrderSessionRow(client, id);
        if (!session) throw new NotFoundError("SESSION_NOT_FOUND");
        if (!canManageSession(user, session.seller_id)) throw new ForbiddenError();
        if (session.status === "fechado") throw new ValidationError("SESSION_ALREADY_FINALIZED");
        if (session.status === "cancelado") throw new ValidationError("SESSION_CANCELLED");
        if (!session.client_id) throw new ValidationError("CLIENT_REQUIRED");

        // order_id só falta aqui se a sessão nunca teve como anexar um
        // pedido no momento em que foi criada (não deveria acontecer já
        // que client_id está garantido acima) -- self-healing em vez de
        // travar o fechamento da venda por um gap de dado.
        const orderId = session.order_id ?? (await getOrCreateOpenOrder(client, {
            clientId: session.client_id, sellerId: session.seller_id,
            clientName: session.client_name, channel: session.channel,
        }))!.id;

        // Upsell: mais de uma sessão pode apontar pro mesmo pedido. Se
        // outra já pagou, não reprocessa (evita recomputar total/duplicar
        // notificação de "pedido confirmado").
        const existingOrder = await findOrderRowById(client, orderId);
        if (existingOrder && (existingOrder.status === "pago" || existingOrder.status === "cancelado")) {
            throw new ValidationError("ORDER_ALREADY_FINALIZED");
        }

        const items = (await listOrderItemRowsByOrder(client, orderId)).map((item) => item.snapshot);
        if (items.length === 0) throw new ValidationError("EMPTY_ORDER");

        const total = items.reduce((sum, item) => sum + item.price * item.qty, 0)
            + (session.shipping?.price ?? 0);
        const row = await updateOrderRow(client, orderId, {
            status: "pago",
            total,
            shipping: session.shipping ?? undefined,
            paymentMethod: typeof body.paymentMethod === "string"
                ? body.paymentMethod
                : undefined,
        });
        if (!row) throw new NotFoundError("ORDER_NOT_FOUND");
        const closed = await closeOrderSessionRow(client, session.id);
        if (closed) changedSession = toOrderSession(closed, items);
        changes.book = (await closeOrderBookWhenFinished(client, session.order_book_id)) ?? undefined;
        return toOrder(row, items);
    });
    if (changedSession) {
        notifySession(tenant.id, changedSession);
        scheduleSessionBroadcast(changedSession);
    }
    if (changes.book) notifyOrderBook(tenant.id, { sellerId: changes.book.seller_id });
    notifyOrder(tenant.id, order);
    return order;
}
