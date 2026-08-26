import { z } from "zod";
import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, CartItem, Order, OrderSession, OrderSessionParticipant } from "@/lib/types";
import { CartItemSchema } from "@/contracts/shared";
import {
    CreateOrderSessionInputSchema,
    UpdateOrderSessionInputSchema,
} from "@/contracts/orders";
import {
    closeStaleOrderSessionRowsByClient,
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
    closeOpenOrderSessionRowsByOrder,
    countOpenOrderSessionRowsBySeller,
} from "@/models/ordersModel";
import { getOrCreateOpenOrder, syncOrderItems } from "./orderItemSync";
import {
    listOrderSessionParticipantRows,
    markOrderSessionParticipantLeftRow,
    upsertOrderSessionParticipantRow,
} from "@/models/orderSessionParticipantsModel";
import { findClientRow } from "@/models/clientsModel";
import { findUserRowById, listOnlineAdministratorIds, listOnlineSellerIds } from "@/models/usersModel";
import { findStoreSettingsRow } from "@/models/settingsModel";
import { listUsersByIds } from "@/services/users";
import { patchClientRow } from "@/services/clients/clientService";
import { recordAuditEvent, ORDER_SESSION_AUDIT_ACTIONS, type AuditRequestContext } from "@/services/audit";
import { enqueueOrderPush, requestProviderOrderResend } from "@/services/erp/orderPushService";
import { logger, errorMeta } from "@/lib/logger";
import { ForbiddenError, NotFoundError, ValidationError } from "@/services/shared/errors";
import { notifyOrder, notifyOrderBook, notifySession } from "@/services/realtime/updateBroadcast";
import { scheduleSessionBroadcast } from "@/services/realtime/sessionBroadcast";
import { findActiveOrderBookRow, findOrderBookRow, insertOrderBookRow, reopenOrderBookRow, type OrderBookRow } from "@/models/orderBooksModel";
import { closeOrderBookWhenFinished } from "./orderBookLifecycle";
import { toOrder, toOrderSession } from "./orderMapper";
import { pickSeller } from "./sellerAssignmentService";

async function reconcileFinalizedCustomerSessions(client: Parameters<typeof findLatestOpenOrderSessionRowByClient>[0], clientId: string) {
    const sessions = await closeStaleOrderSessionRowsByClient(client, clientId);
    const bookIds = new Set(sessions.map((session) => session.order_book_id));
    const books = (await Promise.all(
        [...bookIds].map((bookId) => closeOrderBookWhenFinished(client, bookId)),
    )).filter((book): book is OrderBookRow => Boolean(book));
    return { sessions, books };
}

function notifyReconciledSessions(tenantId: string, reconciled: Awaited<ReturnType<typeof reconcileFinalizedCustomerSessions>>) {
    for (const session of reconciled.sessions) {
        notifySession(tenantId, toOrderSession(session, []));
        scheduleSessionBroadcast(toOrderSession(session, []));
    }
    for (const book of reconciled.books) notifyOrderBook(tenantId, { sellerId: book.seller_id });
}

function canManageSession(user: AuthUser, sellerId: string): boolean {
    return user.role !== "cliente" && (user.role !== "vendedora" || sellerId === user.id);
}

export function canMutateLinkedOrder(status: Order["status"], isClient: boolean): boolean {
    if (status === "cancelado") return false;
    return !isClient || status === "aberto" || status === "aguardando_pagamento";
}

export function totalAfterItemMutation(
    items: Array<Pick<CartItem, "price" | "qty">>,
    order: Pick<NonNullable<Awaited<ReturnType<typeof findOrderRowById>>>, "discount" | "shipping">,
): number {
    const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    return Math.max(0, subtotal - (order.discount?.amount ?? 0) + (order.shipping?.price ?? 0));
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
    const result = await withTenantTransaction(tenant, user, async (client) => {
        const reconciled = await reconcileFinalizedCustomerSessions(client, user.clientId!);
        const row = await findLatestOpenOrderSessionRowByClient(client, user.clientId!);
        if (!row) return { session: null, reconciled };
        const [items, seller] = await Promise.all([
            listOrderSessionItemRowsBySession(client, row.id),
            findUserRowById(client, row.seller_id),
        ]);
        return {
            session: { ...toOrderSession(row, items.map((item) => item.snapshot)), sellerName: seller?.name },
            reconciled,
        };
    });
    notifyReconciledSessions(tenant.id, result.reconciled);
    return result.session;
}

const EnsureCustomerOrderSessionSchema = z.object({ items: z.array(CartItemSchema).optional() });

// Cria (ou recupera) a sessão online da cliente assim que ela loga — a
// vendedora precisa vê-la no talão antes mesmo de montar carrinho, pra
// poder iniciar o atendimento. Itens são opcionais: chamada sem nenhum
// (ver ClientSessionProvider.tsx, disparada no login) cria uma sessão
// vazia; getOrCreateOpenOrder/syncOrderItems já toleram lista vazia.
export async function ensureCustomerOrderSession(
    tenant: Tenant,
    user: AuthUser,
    body: unknown,
    context: AuditRequestContext,
): Promise<OrderSession | null> {
    if (user.role !== "cliente" || !user.clientId) throw new ForbiddenError();
    const parsed = EnsureCustomerOrderSessionSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("INVALID_INPUT", "Dados inválidos.", parsed.error.issues);
    const requestedItems = parsed.data.items ?? [];

    const result = await withTenantTransaction(tenant, user, async (client) => {
        const registration = await findClientRow(client, user.clientId!);
        if (!registration) throw new NotFoundError("CLIENT_NOT_FOUND");
        // Duas abas podem pedir a criação ao mesmo tempo. O lock transacional
        // mantém uma única sessão online por cliente.
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`customer-session:${registration.id}`]);
        const reconciled = await reconcileFinalizedCustomerSessions(client, registration.id);

        // Idempotência no socket/retries: uma cliente só tem uma sessão viva
        // e novas peças serão gravadas pelo evento de atualização.
        const existing = await findLatestOpenOrderSessionRowByClient(client, registration.id);
        if (existing) {
            const items = (await listOrderSessionItemRowsBySession(client, existing.id)).map((item) => item.snapshot);
            return { session: toOrderSession(existing, items), created: false, reconciled };
        }

        // A cliente volta para a última vendedora que a atendeu. Sem esse
        // vínculo, aplica a estratégia configurada entre vendedoras online.
        const [sellerIds, administratorIds, openCounts, settings] = await Promise.all([
            listOnlineSellerIds(client),
            listOnlineAdministratorIds(client),
            countOpenOrderSessionRowsBySeller(client),
            findStoreSettingsRow(client),
        ]);
        // A carteira da cliente tem prioridade mesmo se a responsável estiver
        // offline: a atribuição registra quem atende o pedido, mas não impede
        // a cliente de montar e finalizar a compra sozinha. Para clientes sem
        // histórico, a distribuição continua usando quem está disponível.
        let sellerId = registration.last_seller_id
            ?? pickSeller(sellerIds, openCounts, settings?.assignment_strategy ?? undefined);
        if (!sellerId) sellerId = administratorIds[0] ?? null;
        if (!sellerId) return { session: null, created: false, reconciled };

        const book = (await findActiveOrderBookRow(client, sellerId))
            ?? await insertOrderBookRow(client, sellerId, "Atendimentos online");
        const order = await getOrCreateOpenOrder(client, {
            clientId: registration.id,
            sellerId,
            clientName: registration.name,
            channel: "online",
        });
        const row = await insertOrderSessionRow(client, {
            orderBookId: book.id,
            orderId: order?.id,
            clientName: registration.name,
            clientId: registration.id,
            sellerId,
            channel: "online",
            status: "aberto",
        });
        for (const item of requestedItems) await insertOrderSessionItemRow(client, row.id, item);
        if (order) {
            await syncOrderItems(client, {
                orderId: order.id,
                currentItems: [],
                nextItems: requestedItems,
                actorId: user.id,
                actorRole: user.role,
            });
        }
        await patchClientRow(client, registration.id, { lastSellerId: sellerId });
        const session = toOrderSession(row, requestedItems);
        await recordAuditEvent(client, {
            action: ORDER_SESSION_AUDIT_ACTIONS.CREATED,
            entityId: session.id,
            actor: user,
            context,
            metadata: { channel: "online", hasClient: true, itemCount: requestedItems.length },
        });
        return { session, created: true, reconciled };
    });

    notifyReconciledSessions(tenant.id, result.reconciled);
    if (result.session && result.created) {
        notifySession(tenant.id, result.session);
        scheduleSessionBroadcast(result.session);
    }
    return result.session;
}

export async function createOrderSession(
    tenant: Tenant,
    user: AuthUser,
    body: unknown,
    context: AuditRequestContext,
): Promise<OrderSession> {
    if (user.role === "cliente") throw new ForbiddenError();
    const parsedBody = CreateOrderSessionInputSchema.safeParse(body);
    if (!parsedBody.success) throw new ValidationError("INVALID_INPUT", "Dados inválidos.", parsedBody.error.issues);
    const data = parsedBody.data;
    const created = await withTenantTransaction(tenant, user, async (client) => {
        const items = data.items ?? [];
        const requestedBookId = data.orderBookId;
        const book = requestedBookId
            ? await findOrderBookRow(client, requestedBookId)
            : (await findActiveOrderBookRow(client, user.id)) ?? await insertOrderBookRow(client, user.id, "Talão atual");
        if (!book) throw new NotFoundError("ORDER_BOOK_NOT_FOUND");
        if (book.seller_id !== user.id || book.status !== "aberto") throw new ForbiddenError();
        const requestedClientId = data.clientId;
        const registration = requestedClientId
            ? await findClientRow(client, requestedClientId)
            : null;
        if (requestedClientId && !registration) throw new NotFoundError("CLIENT_NOT_FOUND");
        const clientName = registration?.name ?? (data.clientName?.trim() || "Sem cliente");
        const channel = data.channel === "whatsapp" || data.channel === "online" ? data.channel : "presencial";
        // A mesma cliente não ganha um segundo atendimento online se a
        // vendedora abrir o pedido manualmente enquanto ela já está no site.
        if (registration && channel === "online") {
            await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`customer-session:${registration.id}`]);
            const existing = await findLatestOpenOrderSessionRowByClient(client, registration.id);
            if (existing) {
                const items = (await listOrderSessionItemRowsBySession(client, existing.id)).map((item) => item.snapshot);
                return toOrderSession(existing, items);
            }
        }
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
            notes: data.notes,
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
    rawBody: unknown,
): Promise<OrderSession> {
    const parsedBody = UpdateOrderSessionInputSchema.safeParse(rawBody);
    if (!parsedBody.success) throw new ValidationError("INVALID_INPUT", "Dados inválidos.", parsedBody.error.issues);
    const body = parsedBody.data;
    const changes: { book?: OrderBookRow; order?: Order; pushOrderId?: string } = {};
    const updated = await withTenantTransaction(tenant, user, async (client) => {
        const currentRow = await findOrderSessionRow(client, id);
        if (!currentRow) throw new NotFoundError("SESSION_NOT_FOUND");
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
            if (body.clientId) {
                const registration = await findClientRow(client, body.clientId);
                if (!registration) throw new NotFoundError("CLIENT_NOT_FOUND");
                clientId = registration.id;
                clientName = registration.name;
                await patchClientRow(client, registration.id, { lastSellerId: currentRow.seller_id });
            }
            if (body.notes !== undefined) notes = body.notes;
            if (body.status !== undefined) status = body.status;
        }
        let shipping = currentRow.shipping ?? undefined;
        if (body.shipping === null) shipping = undefined;
        else if (body.shipping) shipping = body.shipping;
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
        let order: Awaited<ReturnType<typeof findOrderRowById>> = null;
        if (orderId) {
            // O pedido é sempre o primeiro lock dos fluxos de checkout e
            // edição. Além de evitar deadlock com sessões irmãs de upsell,
            // isso faz cliques rápidos calcularem o diff sobre o snapshot já
            // confirmado pela transação anterior. A vendedora pode reabrir
            // o atendimento e fazer upsell mesmo depois da confirmação; a
            // cliente, porém, não pode mandar uma limpeza tardia do carrinho
            // contra um pedido que já saiu da etapa de montagem.
            order = await findOrderRowById(client, orderId, true);
            if (!order) throw new NotFoundError("ORDER_NOT_FOUND");
            if (!canMutateLinkedOrder(order.status, isClient)) {
                throw new ValidationError("ORDER_ALREADY_FINALIZED");
            }
        }
        const currentItems = (await listOrderSessionItemRowsBySession(client, id)).map((item) => item.snapshot);
        const items = body.items ?? currentItems;
        // O lock/estado do pedido é validado antes de mexer no snapshot da
        // sessão. Assim um update atrasado falha sem apagar nenhuma das duas
        // fontes de itens dentro da transação.
        if (body.items !== undefined) await replaceOrderSessionItemRows(client, id, items);
        if (orderId) {
            if (justAttached) {
                await syncOrderItems(client, { orderId, currentItems: [], nextItems: items, actorId: user.id, actorRole: user.role });
            } else if (body.items !== undefined) {
                // Diff é (itens ANTES desta MESMA sessão -> itens depois),
                // não (todo o pedido -> body). Com upsell, o pedido pode ter
                // itens vindos de outra sessão (ex. atendimento fechado
                // antes) que essa sessão nunca viu -- diffar contra o
                // pedido inteiro os interpretaria como "removidos" só por
                // não estarem no body desta chamada.
                await syncOrderItems(client, { orderId, currentItems, nextItems: items, actorId: user.id, actorRole: user.role });
            }
            if (order && body.items !== undefined) {
                const persistedItems = (await listOrderItemRowsByOrder(client, orderId)).map((item) => item.snapshot);
                const updatedOrder = await updateOrderRow(client, orderId, {
                    status: order.status,
                    total: totalAfterItemMutation(persistedItems, order),
                });
                if (updatedOrder) {
                    changes.order = toOrder(updatedOrder, persistedItems);
                    // Upsell num pedido já finalizado (novo/separado/pago) muda o
                    // que o ERP tem registrado -- reenvia. Edição do carrinho ainda
                    // "aberto"/"aguardando_pagamento" não conta: o pedido nem chegou
                    // a ser enviado ao ERP ainda (isso só acontece no checkout, ver
                    // finalizeOrderSession/confirmPayment/createCustomerOrder).
                    if (order.status !== "aberto" && order.status !== "aguardando_pagamento") {
                        changes.pushOrderId = orderId;
                    }
                }
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
    if (changes.order) notifyOrder(tenant.id, changes.order);
    if (changes.book) notifyOrderBook(tenant.id, {
        sellerId: changes.book.seller_id,
    });
    if (changes.pushOrderId) {
        try {
            await requestProviderOrderResend(tenant, user, changes.pushOrderId);
        } catch (error) {
            logger.error("ERP_ORDER_PUSH", "Falha ao reenviar pedido alterado ao ERP", {
                orderId: changes.pushOrderId, ...errorMeta(error),
            });
        }
    }
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
): Promise<Order> {
    if (user.role === "cliente") throw new ForbiddenError();
    let changedSessions: OrderSession[] = [];
    let changedBooks: OrderBookRow[] = [];
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
        const existingOrder = await findOrderRowById(client, orderId, true);
        if (existingOrder && existingOrder.status !== "aberto" && existingOrder.status !== "aguardando_pagamento") {
            throw new ValidationError("ORDER_ALREADY_FINALIZED");
        }

        const items = (await listOrderItemRowsByOrder(client, orderId)).map((item) => item.snapshot);
        if (items.length === 0) throw new ValidationError("EMPTY_ORDER");

        const total = items.reduce((sum, item) => sum + item.price * item.qty, 0)
            + (session.shipping?.price ?? 0);
        // Sem motor de pagamentos de verdade, "finalizar" não paga mais o
        // pedido -- só fecha o carrinho pra separação (ver migration 036).
        // paymentMethod fica sem uso aqui até existir cobrança real.
        const row = await updateOrderRow(client, orderId, {
            status: "novo",
            total,
            shipping: session.shipping ?? undefined,
        });
        if (!row) throw new NotFoundError("ORDER_NOT_FOUND");
        // Fecha TODA sessão irmã ainda aberta que aponte pro mesmo pedido
        // (upsell entre talões), não só a que disparou o fechamento --
        // senão ela fica presa "aberta" apontando pra um pedido já pago.
        const closedRows = await closeOpenOrderSessionRowsByOrder(client, orderId);
        changedSessions = closedRows.map((closedRow) => toOrderSession(closedRow, items));
        const bookIds = new Set(closedRows.map((closedRow) => closedRow.order_book_id));
        changedBooks = (await Promise.all(
            [...bookIds].map((bookId) => closeOrderBookWhenFinished(client, bookId)),
        )).filter((book): book is OrderBookRow => Boolean(book));
        return toOrder(row, items);
    });
    for (const changedSession of changedSessions) {
        notifySession(tenant.id, changedSession);
        scheduleSessionBroadcast(changedSession);
    }
    for (const book of changedBooks) notifyOrderBook(tenant.id, { sellerId: book.seller_id });
    notifyOrder(tenant.id, order);
    await enqueueOrderPush(tenant, user, order.id);
    return order;
}
