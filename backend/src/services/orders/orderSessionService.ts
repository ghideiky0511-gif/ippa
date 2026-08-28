import { z } from "zod";
import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, CartItem, DeliveryQuote, Order, OrderSession, OrderSessionParticipant } from "@/lib/types";
import { CartItemSchema, CepSchema } from "@/contracts/shared";
import {
    CreateOrderSessionInputSchema,
    UpdateOrderSessionInputSchema,
} from "@/contracts/orders";
import {
    applyOrderSessionItemDeltaRows,
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
    updateOrderSessionRow,
    setOrderSessionFreightRow,
    updateOrderRow,
    closeOpenOrderSessionRowsByOrder,
    countOpenOrderSessionRowsBySeller,
} from "@/models/ordersModel";
import { findActiveDeliveryOfferingRow, listActiveDeliveryConfigurationRows } from "@/models/deliveryModel";
import {
    findFreightQuoteRow,
    insertFreightQuoteRows,
    selectFreightQuoteRow,
} from "@/models/freightQuotesModel";
import { findOrderFreightRowByOrderId, insertOrderFreightRow, type OrderFreightRow } from "@/models/orderFreightsModel";
import { getOrCreateOpenOrder, syncOrderItems } from "./orderItemSync";
import {
    listOrderSessionParticipantRows,
    markOrderSessionParticipantLeftRow,
    upsertOrderSessionParticipantRow,
} from "@/models/orderSessionParticipantsModel";
import { findClientRow } from "@/models/clientsModel";
import { findUserRowByClientId, findUserRowById, listOnlineAdministratorIds, listOnlineSellerIds } from "@/models/usersModel";
import { findStoreSettingsRow } from "@/models/settingsModel";
import { listUsersByIds } from "@/services/users";
import { patchClientRow } from "@/services/clients/clientService";
import { recordAuditEvent, ORDER_SESSION_AUDIT_ACTIONS, type AuditRequestContext } from "@/services/audit";
import { enqueueOrderPush, requestProviderOrderResend } from "@/services/erp/orderPushService";
import { logger, errorMeta } from "@/lib/logger";
import { ForbiddenError, NotFoundError, ValidationError } from "@/services/shared/errors";
import { notifyOrder, notifyOrderBook, notifySession, notifySessionCreated } from "@/services/realtime/updateBroadcast";
import { scheduleSessionBroadcast } from "@/services/realtime/sessionBroadcast";
import { findActiveOrderBookRow, findOrderBookRow, insertOrderBookRow, reopenOrderBookRow, type OrderBookRow } from "@/models/orderBooksModel";
import { closeOrderBookWhenFinished } from "./orderBookLifecycle";
import { applyCartItemsDelta, diffCartItems, toFreightQuote, toOrder, toOrderBook, toOrderSession } from "./orderMapper";
import { pickSeller } from "./sellerAssignmentService";
import { assertOrderItemsInStock } from "./stockGate";
import { deliveryQuoteFromConfiguration } from "./deliveryService";

async function reconcileFinalizedCustomerSessions(client: Parameters<typeof findLatestOpenOrderSessionRowByClient>[0], clientId: string) {
    const sessions = await closeStaleOrderSessionRowsByClient(client, clientId);
    // As peças continuam existindo (fechar não as apaga) — buscar de
    // verdade em vez de mapear com items:[] falso, que zerava o carrinho de
    // quem estivesse na room /pedidos dessa sessão (ver scheduleSessionBroadcast
    // abaixo).
    const sessionsWithItems = await Promise.all(sessions.map(async (session) => ({
        session,
        items: (await listOrderSessionItemRowsBySession(client, session.id)).map((item) => item.snapshot),
    })));
    const bookIds = new Set(sessions.map((session) => session.order_book_id));
    const books = (await Promise.all(
        [...bookIds].map((bookId) => closeOrderBookWhenFinished(client, bookId)),
    )).filter((book): book is OrderBookRow => Boolean(book));
    return { sessions: sessionsWithItems, books };
}

function notifyReconciledSessions(tenantId: string, reconciled: Awaited<ReturnType<typeof reconcileFinalizedCustomerSessions>>) {
    for (const { session, items } of reconciled.sessions) {
        const mapped = toOrderSession(session, items);
        notifySession(tenantId, mapped);
        scheduleSessionBroadcast(mapped);
    }
    for (const book of reconciled.books) notifyOrderBook(tenantId, toOrderBook(book));
}

export function canManageSession(user: AuthUser, sellerId: string): boolean {
    return user.role !== "cliente" && (user.role !== "vendedora" || sellerId === user.id);
}

export function canMutateLinkedOrder(status: Order["status"], isClient: boolean): boolean {
    if (status === "cancelado") return false;
    return !isClient || status === "aberto" || status === "aguardando_pagamento";
}

export function totalAfterItemMutation(
    items: Array<Pick<CartItem, "price" | "qty">>,
    order: Pick<NonNullable<Awaited<ReturnType<typeof findOrderRowById>>>, "discount">,
    freightPrice: number,
): number {
    const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    return Math.max(0, subtotal - (order.discount?.amount ?? 0) + freightPrice);
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

// Resync barato de UMA sessão — usado pelo cliente de realtime incremental
// (ver frontend/src/lib/realtime/applySessionEvent.ts) quando a cadeia
// causal de um `session_items` tem buraco (evento perdido): em vez de
// refazer o GET /sessions inteiro, busca só a sessão em questão. Mesma
// regra de visibilidade de canAccessOrderSession/canManageSession.
export async function orderSessionById(tenant: Tenant, user: AuthUser, id: string): Promise<OrderSession> {
    return withTenantTransaction(tenant, user, async (client) => {
        const row = await findOrderSessionRow(client, id);
        if (!row) throw new NotFoundError("SESSION_NOT_FOUND");
        const allowed = user.role === "cliente"
            ? row.client_id === user.clientId
            : canManageSession(user, row.seller_id);
        if (!allowed) throw new ForbiddenError();
        const items = (await listOrderSessionItemRowsBySession(client, id)).map((item) => item.snapshot);
        return toOrderSession(row, items);
    });
}

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
        // sellerName só existe computado (não persistido, ver
        // contracts/orders.ts) e é o que o PresenceBadge da cliente lê —
        // preenche aqui porque este é o evento que a leva a adotar a sessão
        // pela primeira vez (session_created), sem passar por /sessions/mine.
        const seller = await findUserRowById(client, sellerId);
        const session = { ...toOrderSession(row, requestedItems), sellerName: seller?.name };
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
        notifySessionCreated(tenant.id, result.session);
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
    const result = await withTenantTransaction(tenant, user, async (client) => {
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
                return { session: toOrderSession(existing, items), created: false };
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
        return { session: created, created: true };
    });
    // O caminho de reaproveitamento (cliente já tinha sessão online aberta)
    // não mudou nada — não notifica, só devolve o que já existia.
    if (result.created) {
        notifySessionCreated(tenant.id, result.session);
        scheduleSessionBroadcast(result.session);
    }
    return result.session;
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
    const changes: {
        book?: OrderBookRow;
        order?: Order;
        pushOrderId?: string;
        itemsDelta?: { prevUpdatedAt: string; set: CartItem[]; del: string[] };
        onlyItemsChanged?: boolean;
    } = {};
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
        const itemsChanged = body.itemsDelta !== undefined;
        const items = body.itemsDelta ? applyCartItemsDelta(currentItems, body.itemsDelta) : currentItems;
        // Só o caso quente (itens de fato alterados nesta chamada) vira
        // session_items — as demais mutações (status, cliente, frete...)
        // seguem só no session_patch abaixo, que nunca toca em itens.
        if (itemsChanged) {
            changes.itemsDelta = {
                prevUpdatedAt: currentRow.updated_at.toISOString(),
                ...diffCartItems(currentItems, items),
            };
        }
        // O lock/estado do pedido é validado antes de mexer no snapshot da
        // sessão. Assim um update atrasado falha sem apagar nenhuma das duas
        // fontes de itens dentro da transação.
        if (body.itemsDelta !== undefined) await applyOrderSessionItemDeltaRows(client, id, body.itemsDelta);
        if (orderId) {
            if (justAttached) {
                await syncOrderItems(client, { orderId, currentItems: [], nextItems: items, actorId: user.id, actorRole: user.role });
            } else if (itemsChanged) {
                // Diff é (itens ANTES desta MESMA sessão -> itens depois),
                // não (todo o pedido -> body). Com upsell, o pedido pode ter
                // itens vindos de outra sessão (ex. atendimento fechado
                // antes) que essa sessão nunca viu -- diffar contra o
                // pedido inteiro os interpretaria como "removidos" só por
                // não estarem no body desta chamada.
                await syncOrderItems(client, { orderId, currentItems, nextItems: items, actorId: user.id, actorRole: user.role });
            }
            if (order && itemsChanged) {
                const persistedItems = (await listOrderItemRowsByOrder(client, orderId)).map((item) => item.snapshot);
                const freightRow = await findOrderFreightRowByOrderId(client, orderId);
                const updatedOrder = await updateOrderRow(client, orderId, {
                    status: order.status,
                    total: totalAfterItemMutation(persistedItems, order, Number(freightRow?.price ?? 0)),
                });
                if (updatedOrder) {
                    changes.order = toOrder(updatedOrder, persistedItems, freightRow);
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
        // Caso quente (só itens mudaram, ex. "+1 peça"): não vale a pena
        // mandar session_patch junto — seria reafirmar campos que não
        // mudaram nesta chamada. Comparado contra o estado ANTES desta
        // mutação (currentRow), não contra o que updateOrderSessionRow vai
        // gravar (que é sempre igual a estas variáveis).
        changes.onlyItemsChanged = itemsChanged
            && clientId === (currentRow.client_id ?? undefined)
            && clientName === currentRow.client_name
            && notes === (currentRow.notes ?? undefined)
            && status === currentRow.status
            && orderId === (currentRow.order_id ?? undefined);
        const row = await updateOrderSessionRow(client, id, {
            clientName, clientId, notes, status, orderId,
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
    notifySession(tenant.id, updated, changes.itemsDelta, { skipPatch: changes.onlyItemsChanged });
    scheduleSessionBroadcast(updated);
    if (changes.order) notifyOrder(tenant.id, changes.order);
    if (changes.book) notifyOrderBook(tenant.id, toOrderBook(changes.book));
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
        if (!session.freight_quote_id) throw new ValidationError("SHIPPING_REQUIRED");
        if (!session.client_id) throw new ValidationError("CLIENT_REQUIRED");
        const registration = await findClientRow(client, session.client_id);
        if (!registration || !registration.name.trim() || !registration.cpf_cnpj?.trim() ||
            !registration.email?.trim()) throw new ValidationError("INCOMPLETE_CLIENT");
        if (session.delivery_fulfillment_mode === "address_delivery" && !registration.cep?.trim()) {
            throw new ValidationError("DELIVERY_ADDRESS_REQUIRED");
        }
        if (!await findUserRowByClientId(client, session.client_id)) {
            throw new ValidationError("CLIENT_LOGIN_REQUIRED");
        }

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
        // Gate obrigatório: reconfirma que o estoque ainda cobre o pedido
        // no instante exato em que ele deixa de ser editável (ver stockGate).
        await assertOrderItemsInStock(tenant, client, items);

        const freightPrice = Number(session.freight_price ?? 0);
        const total = items.reduce((sum, item) => sum + item.price * item.qty, 0) + freightPrice;
        // Sem motor de pagamentos de verdade, "finalizar" não paga mais o
        // pedido -- só fecha o carrinho pra separação (ver migration 036).
        // paymentMethod fica sem uso aqui até existir cobrança real.
        const row = await updateOrderRow(client, orderId, { status: "novo", total });
        if (!row) throw new NotFoundError("ORDER_NOT_FOUND");
        // Snapshot do frete escolhido na sessão (ver selectFreightQuote) vira
        // a linha definitiva de order_freights -- sem frete escolhido (sessão
        // finalizada sem passar por /frete), não há o que gravar.
        let freightRow: OrderFreightRow | undefined;
        if (session.freight_kind) {
            freightRow = await insertOrderFreightRow(client, {
                orderId,
                providerId: session.freight_provider_id,
                quoteId: session.freight_quote_id,
                kind: session.freight_kind,
                label: session.freight_label!,
                price: freightPrice,
                etaLabel: session.freight_eta_label,
                deliveryTypeId: session.delivery_type_id,
                deliveryOfferingId: session.delivery_offering_id,
                deliveryProviderId: session.delivery_provider_id,
                fulfillmentMode: session.delivery_fulfillment_mode,
                deliveryTypeName: session.delivery_type_name,
                deliveryProviderName: session.delivery_provider_name,
                destinationCep: session.delivery_destination_cep,
            });
        }
        // Fecha TODA sessão irmã ainda aberta que aponte pro mesmo pedido
        // (upsell entre talões), não só a que disparou o fechamento --
        // senão ela fica presa "aberta" apontando pra um pedido já pago.
        const closedRows = await closeOpenOrderSessionRowsByOrder(client, orderId);
        changedSessions = closedRows.map((closedRow) => toOrderSession(closedRow, items));
        const bookIds = new Set(closedRows.map((closedRow) => closedRow.order_book_id));
        changedBooks = (await Promise.all(
            [...bookIds].map((bookId) => closeOrderBookWhenFinished(client, bookId)),
        )).filter((book): book is OrderBookRow => Boolean(book));
        return toOrder(row, items, freightRow);
    });
    for (const changedSession of changedSessions) {
        notifySession(tenant.id, changedSession);
        scheduleSessionBroadcast(changedSession);
    }
    for (const book of changedBooks) notifyOrderBook(tenant.id, toOrderBook(book));
    notifyOrder(tenant.id, order);
    await enqueueOrderPush(tenant, user, order.id);
    return order;
}

function canAccessSessionRow(user: AuthUser, session: { seller_id: string; client_id: string | null }): boolean {
    if (user.role === "cliente") return session.client_id === user.clientId;
    return canManageSession(user, session.seller_id);
}

// Gera (e persiste) uma cotação por freight_provider ativo do tenant --
// substitui o MOCK_SHIPPING_OPTIONS que o frontend usava antes. Cada
// chamada insere linhas novas em freight_quotes (histórico de o que foi
// mostrado), sem reaproveitar cotações antigas da mesma sessão.
export async function listDeliveryQuotes(
    tenant: Tenant,
    user: AuthUser,
    sessionId: string,
    destinationCep?: string,
): Promise<DeliveryQuote[]> {
    return withTenantTransaction(tenant, user, async (client) => {
        const session = await findOrderSessionRow(client, sessionId);
        if (!session) throw new NotFoundError("SESSION_NOT_FOUND");
        if (!canAccessSessionRow(user, session)) throw new ForbiddenError();
        let normalizedCep: string | undefined;
        if (destinationCep) {
            const parsedCep = CepSchema.safeParse(destinationCep);
            if (!parsedCep.success) throw new ValidationError("INVALID_INPUT", "CEP inválido.");
            normalizedCep = parsedCep.data;
        }
        const configurations = await listActiveDeliveryConfigurationRows(client);
        const quotable = configurations.filter((entry) =>
            entry.fulfillment_mode === "pickup" || Boolean(normalizedCep),
        );
        const rows = await insertFreightQuoteRows(
            client,
            sessionId,
            quotable.map((configuration) => {
                const quote = deliveryQuoteFromConfiguration(configuration);
                return {
                providerId: null,
                kind: quote.kind,
                destinationCep: configuration.fulfillment_mode === "address_delivery" ? normalizedCep : undefined,
                label: quote.label,
                price: quote.price,
                etaLabel: quote.etaLabel,
                deliveryTypeId: quote.deliveryTypeId,
                deliveryOfferingId: quote.deliveryOfferingId,
                deliveryProviderId: quote.providerId,
                fulfillmentMode: quote.fulfillmentMode,
                deliveryTypeName: quote.deliveryTypeName,
                deliveryProviderName: quote.providerName,
                };
            }),
        );
        return rows.map(toFreightQuote);
    });
}

// Alias temporário durante o rollout do frontend.
export const listFreightQuotes = listDeliveryQuotes;

// Marca a cotação escolhida (índice único parcial em freight_quotes garante
// 1 selecionada por sessão) e copia o snapshot pras 6 colunas de frete de
// order_sessions -- é o único lugar que deve alterar frete de uma sessão
// (updateSession não aceita mais esse campo).
export async function selectFreightQuote(
    tenant: Tenant,
    user: AuthUser,
    sessionId: string,
    quoteId: string,
): Promise<OrderSession> {
    const updated = await withTenantTransaction(tenant, user, async (client) => {
        const session = await findOrderSessionRow(client, sessionId);
        if (!session) throw new NotFoundError("SESSION_NOT_FOUND");
        if (!canAccessSessionRow(user, session)) throw new ForbiddenError();
        if (session.status === "cancelado" || session.status === "fechado") {
            throw new ValidationError("SESSION_CANCELLED");
        }
        const quote = await findFreightQuoteRow(client, quoteId);
        if (!quote || quote.order_session_id !== sessionId) throw new NotFoundError("FREIGHT_QUOTE_NOT_FOUND");
        if (!quote.delivery_offering_id || !quote.delivery_type_id || !quote.delivery_provider_id ||
            !quote.delivery_fulfillment_mode || !quote.delivery_type_name || !quote.delivery_provider_name) {
            throw new ValidationError("DELIVERY_OFFERING_NOT_FOUND");
        }
        const activeOffering = await findActiveDeliveryOfferingRow(client, quote.delivery_offering_id);
        if (!activeOffering) throw new ValidationError("DELIVERY_OFFERING_NOT_FOUND");
        if (quote.delivery_fulfillment_mode === "address_delivery" && !quote.destination_cep) {
            throw new ValidationError("DELIVERY_ADDRESS_REQUIRED");
        }
        await selectFreightQuoteRow(client, sessionId, quoteId);
        const row = await setOrderSessionFreightRow(client, sessionId, {
            quoteId: quote.id,
            providerId: quote.provider_id,
            kind: quote.kind,
            label: quote.label,
            price: Number(quote.price),
            etaLabel: quote.eta_label,
            deliveryTypeId: quote.delivery_type_id,
            deliveryOfferingId: quote.delivery_offering_id,
            deliveryProviderId: quote.delivery_provider_id,
            fulfillmentMode: quote.delivery_fulfillment_mode,
            deliveryTypeName: quote.delivery_type_name,
            deliveryProviderName: quote.delivery_provider_name,
            destinationCep: quote.destination_cep,
        });
        if (!row) throw new NotFoundError("SESSION_NOT_FOUND");
        const items = (await listOrderSessionItemRowsBySession(client, sessionId)).map((item) => item.snapshot);
        return toOrderSession(row, items);
    });
    notifySession(tenant.id, updated);
    scheduleSessionBroadcast(updated);
    return updated;
}
