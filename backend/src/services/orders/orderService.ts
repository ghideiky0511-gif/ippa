import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, FreightQuote, Order, OrderChannel, OrderSession } from "@/lib/types";
import { CreateCustomerOrderInputSchema } from "@/contracts/orders";
import {
    cancelOpenOrderSessionRowsByOrder,
    closeOpenOrderSessionRowsByOrder,
    findOrderRowById,
    findOrderRowByNumber,
    findOrderSessionRow,
    listOrderItemRows,
    listOrderItemRowsByOrder,
    listOrderRowsBy,
    listTenantOrderRows,
    updateOrderRow,
} from "@/models/ordersModel";
import { findFreightProviderRow, listActiveFreightProviderRows } from "@/models/freightProvidersModel";
import { findOrderFreightRowByOrderId, insertOrderFreightRow, listOrderFreightRows } from "@/models/orderFreightsModel";
import { computeFreightPrice } from "./freightPricing";
import { getOrCreateOpenOrder, syncOrderItems } from "./orderItemSync";
import { findUserRowById } from "@/models/usersModel";
import { findStoreSettingsRow } from "@/models/settingsModel";
import { notifyOrder, notifyOrderBook, notifySession } from "@/services/realtime/updateBroadcast";
import { notifyNewOrderForSeller, notifyOrderConfirmed } from "@/services/notifications";
import { cancelProviderOrderForOrder, enqueueOrderPush, requestProviderOrderResend } from "@/services/erp/orderPushService";
import { logger, errorMeta } from "@/lib/logger";
import { ForbiddenError, NotFoundError, ValidationError } from "@/services/shared/errors";
import { toOrder, toOrderBook, toOrderSession } from "./orderMapper";
import { closeOrderBookWhenFinished } from "./orderBookLifecycle";
import type { OrderBookRow } from "@/models/orderBooksModel";
import { ORDER_AUDIT_ACTIONS, recordAuditEvent, type AuditRequestContext } from "@/services/audit";

// Checkout direto (cliente sem talão/sessão ativa) não passa por
// freight_quotes -- lista os providers ativos já convertidos pra
// preço/label/prazo, pra cliente escolher um antes de mandar
// freightProviderId em createCustomerOrder.
export async function listActiveFreightProviders(tenant: Tenant, user: AuthUser): Promise<FreightQuote[]> {
    return withTenantTransaction(tenant, user, async (client) => {
        const providers = await listActiveFreightProviderRows(client);
        return providers
            .filter((provider) => provider.kind !== "carrier")
            .map((provider) => ({ id: provider.id, providerId: provider.id, kind: provider.kind, ...computeFreightPrice(provider) }));
    });
}

function isAdministrator(user: AuthUser): boolean {
    return user.role === "administrador" && user.permissions?.adminAccess === true;
}

// Marcar como pago manualmente e cancelar pedido (abaixo) são ações
// administrativas mas não exigem admin -- mesmo critério mais permissivo
// já usado em cancelar talão vazio (orderBookService.requireInternal):
// qualquer papel interno pode reconciliar um pagamento recebido fora do
// sistema (dinheiro, Pix direto) ou cancelar um pedido da própria loja.
function requireInternal(user: AuthUser) {
    if (user.role === "cliente") throw new ForbiddenError();
}

export async function userOrders(
    tenant: Tenant,
    user: AuthUser,
    filters?: { clientId?: string },
): Promise<Order[]> {
    if (filters?.clientId && !isAdministrator(user)) throw new ForbiddenError();
    return withTenantTransaction(tenant, user, async (client) => {
        const [orders, items, freights] = await Promise.all([
            filters?.clientId
                ? listOrderRowsBy(client, "client_id", filters.clientId)
                : isAdministrator(user)
                  ? listTenantOrderRows(client)
                  : user.role === "cliente" && user.clientId
                    ? listOrderRowsBy(client, "client_id", user.clientId)
                    : user.role === "vendedora"
                      ? listOrderRowsBy(client, "seller_id", user.id)
                      : listTenantOrderRows(client),
            listOrderItemRows(client),
            listOrderFreightRows(client),
        ]);
        return orders.map((order) =>
            toOrder(
                order,
                items
                    .filter((item) => item.order_id === order.id)
                    .map((item) => item.snapshot),
                freights.find((freight) => freight.order_id === order.id),
            ),
        );
    });
}

// Pedido único (página de detalhe) -- mesma regra de visibilidade de
// userOrders (admin vê tudo; vendedora só o que é dela; cliente só o que é
// dela), só que por id em vez de lista completa.
export async function orderById(tenant: Tenant, user: AuthUser, orderId: string): Promise<Order> {
    return withTenantTransaction(tenant, user, async (client) => {
        const orderRow = await findOrderRowById(client, orderId);
        return visibleOrder(client, user, orderRow);
    });
}

/** Consulta cliente por número humanizado, sem expor UUIDs na URL. */
export async function orderByNumber(tenant: Tenant, user: AuthUser, orderNumber: number): Promise<Order> {
    return withTenantTransaction(tenant, user, async (client) => {
        const orderRow = await findOrderRowByNumber(client, orderNumber);
        return visibleOrder(client, user, orderRow);
    });
}

async function visibleOrder(
    client: Parameters<typeof listOrderItemRowsByOrder>[0],
    user: AuthUser,
    orderRow: Awaited<ReturnType<typeof findOrderRowById>>,
): Promise<Order> {
    if (!orderRow) throw new NotFoundError();
    const isOwnAsSeller = user.role === "vendedora" && orderRow.seller_id === user.id;
    const isOwnAsClient = user.role === "cliente" && user.clientId && orderRow.client_id === user.clientId;
    if (!isAdministrator(user) && !isOwnAsSeller && !isOwnAsClient) throw new ForbiddenError();
    const items = (await listOrderItemRowsByOrder(client, orderRow.id)).map((item) => item.snapshot);
    const freightRow = await findOrderFreightRowByOrderId(client, orderRow.id);
    return toOrder(orderRow, items, freightRow);
}

export async function createCustomerOrder(
    tenant: Tenant,
    user: AuthUser,
    rawBody: unknown,
): Promise<Order> {
    if (user.role !== "cliente" || !user.clientId) throw new ForbiddenError();
    const parsed = CreateCustomerOrderInputSchema.safeParse(rawBody);
    if (!parsed.success) throw new ValidationError("INVALID_INPUT", "Dados inválidos.", parsed.error.issues);
    const body = parsed.data;
    const items = body.items;
    const requestedChannel = body.channel;
    let changedSessions: OrderSession[] = [];
    let changedBooks: OrderBookRow[] = [];
    let sellerRecipient: Pick<AuthUser, "id" | "role"> | undefined;
    const order = await withTenantTransaction(tenant, user, async (client) => {
        let sellerId: string | undefined;
        // Checkout iniciado numa sessão de vendedora já tem order_id (foi
        // anexado/criado quando a sessão nasceu) -- reaproveita em vez de
        // criar pedido novo, senão o upsell feito durante o atendimento
        // (ver updateSession) ficaria órfão.
        let orderId: string | undefined;
        // Só true quando o pedido veio de uma sessão de vendedora -- nesse
        // caso os itens já foram sincronizados ao vivo (ver updateSession)
        // e order_items é quem manda, não o body: um diff aqui poderia
        // apagar upsell de uma OUTRA sessão que aponte pro mesmo pedido e
        // que este checkout nunca viu.
        let itemsFromSession = false;
        if (body.sessionId) {
            const session = await findOrderSessionRow(client, body.sessionId);
            if (session && session.client_id === user.clientId) {
                const settings = await findStoreSettingsRow(client);
                if (settings?.features?.clientSelfCheckout === false)
                    throw new ForbiddenError("SELF_CHECKOUT_DISABLED");
                sellerId = session.seller_id;
                orderId = session.order_id ?? undefined;
                itemsFromSession = Boolean(orderId);
            }
        }
        const channel: OrderChannel = requestedChannel === "presencial" || requestedChannel === "whatsapp"
            ? requestedChannel
            : "online";
        // Sem sessão (autosserviço puro do catálogo): reaproveita pedido em
        // aberto se a cliente já tiver um (ex. checkout abandonado antes),
        // senão cria. Sem sincronização ao vivo enquanto ela navega -- os
        // itens só chegam aqui, completos, no instante do checkout.
        if (!orderId) orderId = (await getOrCreateOpenOrder(client, { clientId: user.clientId!, sellerId, clientName: user.name, channel }))?.id;
        if (!orderId) throw new ValidationError();
        // Serializa a confirmação com edições do talão e nunca conclui um
        // cabeçalho vazio. Se uma limpeza/edição ganhar a corrida, o checkout
        // falha preservando a tela para nova tentativa em vez de gravar um
        // pedido sem order_items.
        const currentOrder = await findOrderRowById(client, orderId, true);
        if (!currentOrder) throw new NotFoundError("ORDER_NOT_FOUND");
        if (currentOrder.status !== "aberto" && currentOrder.status !== "aguardando_pagamento") {
            throw new ValidationError("ORDER_ALREADY_FINALIZED");
        }
        let orderItems = items;
        if (itemsFromSession) {
            orderItems = (await listOrderItemRowsByOrder(client, orderId)).map((item) => item.snapshot);
        } else {
            const currentItems = (await listOrderItemRowsByOrder(client, orderId)).map((item) => item.snapshot);
            await syncOrderItems(client, { orderId, currentItems, nextItems: items, actorId: user.id, actorRole: user.role });
        }
        if (orderItems.filter((item) => item.qty > 0).length === 0) throw new ValidationError("EMPTY_ORDER");
        // Checkout direto não passa por freight_quotes (não há sessão pra
        // pendurar a cotação) -- a cliente escolhe um provider ativo e o
        // preço/label/prazo vêm direto da config dele (mesma regra de
        // orderSessionService.listFreightQuotes).
        const freightProvider = await findFreightProviderRow(client, body.freightProviderId);
        if (!freightProvider || !freightProvider.active) throw new ValidationError("FREIGHT_PROVIDER_NOT_FOUND");
        const freightPrice = computeFreightPrice(freightProvider);
        // Sem motor de pagamentos de verdade, este checkout só confirma o
        // pedido (fecha o carrinho pra separação) -- não paga mais (ver
        // migration 036). paymentMethod fica sem uso até existir cobrança real.
        const row = await updateOrderRow(client, orderId, {
            status: "novo",
            total: body.total,
            discount: body.discount,
        });
        if (!row) throw new NotFoundError("ORDER_NOT_FOUND");
        const freightRow = await insertOrderFreightRow(client, {
            orderId,
            providerId: freightProvider.id,
            quoteId: null,
            kind: freightProvider.kind,
            label: freightPrice.label,
            price: freightPrice.price,
            etaLabel: freightPrice.etaLabel,
        });
        if (sellerId) {
            const seller = await findUserRowById(client, sellerId);
            if (seller) sellerRecipient = { id: seller.id, role: seller.role };
        }
        // Fecha toda sessão ainda aberta apontando pro pedido pago --
        // inclui a sessão do checkout e qualquer irmã de upsell em outro
        // talão, senão ela fica presa "aberta" num pedido já finalizado.
        const closedRows = await closeOpenOrderSessionRowsByOrder(client, orderId);
        changedSessions = closedRows.map((closedRow) => toOrderSession(closedRow, orderItems));
        const bookIds = new Set(closedRows.map((closedRow) => closedRow.order_book_id));
        changedBooks = (await Promise.all(
            [...bookIds].map((bookId) => closeOrderBookWhenFinished(client, bookId)),
        )).filter((book): book is OrderBookRow => Boolean(book));
        return toOrder(row, orderItems, freightRow);
    });
    for (const changedSession of changedSessions) notifySession(tenant.id, changedSession);
    for (const book of changedBooks) notifyOrderBook(tenant.id, toOrderBook(book));
    notifyOrder(tenant.id, order);
    notifyOrderConfirmed(tenant, user, order);
    if (sellerRecipient) notifyNewOrderForSeller(tenant, sellerRecipient, order);
    await enqueueOrderPush(tenant, user, order.id);
    return order;
}

// Registro administrativo manual de pagamento -- sem gateway nenhum por
// trás (ver migration 036, "'pago': só alcançável ... quando existir motor
// de pagamentos de verdade"). É a válvula de escape pra quando a loja
// recebeu por fora do sistema (dinheiro, Pix direto) e precisa refletir
// isso no pedido. `paymentMethod` é texto livre por ora -- uma futura
// orders_payments com múltiplas formas por pedido é evolução natural disto,
// não escopo aqui. Sessões/talão já foram fechados no checkout que criou o
// pedido (ver createCustomerOrder acima), por isso não repete esse passo.
export async function markOrderPaid(
    tenant: Tenant,
    user: AuthUser,
    orderId: string,
    paymentMethod: string | undefined,
    auditRequestContext: AuditRequestContext,
): Promise<Order> {
    requireInternal(user);
    const order = await withTenantTransaction(tenant, user, async (client) => {
        const existing = await findOrderRowById(client, orderId);
        if (!existing) throw new NotFoundError("ORDER_NOT_FOUND");
        if (existing.status === "aberto") throw new ValidationError("ORDER_NOT_READY_FOR_PAYMENT");
        if (existing.status === "pago") throw new ValidationError("ORDER_ALREADY_PAID");
        if (existing.status === "cancelado") throw new ValidationError("ORDER_ALREADY_CANCELLED");
        const items = (await listOrderItemRowsByOrder(client, orderId)).map((item) => item.snapshot);
        const row = await updateOrderRow(client, orderId, { status: "pago", paymentMethod });
        if (!row) throw new NotFoundError("ORDER_NOT_FOUND");
        await recordAuditEvent(client, {
            action: ORDER_AUDIT_ACTIONS.MANUALLY_MARKED_PAID,
            entityId: orderId,
            actor: user,
            context: auditRequestContext,
            metadata: paymentMethod ? { paymentMethod } : {},
        });
        const freightRow = await findOrderFreightRowByOrderId(client, orderId);
        return toOrder(row, items, freightRow);
    });
    notifyOrder(tenant.id, order);
    // Marcar como pago é uma alteração do pedido como qualquer outra --
    // reenvia (mesmo mecanismo do upsell pós-checkout em
    // orderSessionService.updateSession) para o ERP refletir o status atual.
    // Melhor esforço: uma falha aqui não pode desfazer o pagamento já
    // registrado localmente, que é a fonte de verdade.
    try {
        await requestProviderOrderResend(tenant, user, orderId, auditRequestContext);
    } catch (error) {
        logger.error("ERP_ORDER_PUSH", "Falha ao reenviar pedido pago ao ERP", { orderId, ...errorMeta(error) });
    }
    return order;
}

// Cancela o pedido (qualquer estado exceto já pago/já cancelado -- ver
// decisão de produto: cancelar um pedido pago exigiria estorno, fora de
// escopo aqui) e cancela junto toda sessão/talão irmão ainda aberto. O
// cancelamento no ERP é melhor esforço e nunca bloqueia o cancelamento local
// (que é a fonte de verdade) -- ver cancelProviderOrderForOrder.
export async function cancelOrder(
    tenant: Tenant,
    user: AuthUser,
    orderId: string,
    auditRequestContext: AuditRequestContext,
): Promise<{ order: Order; erpWarning?: string }> {
    requireInternal(user);
    let cancelledSessions: OrderSession[] = [];
    let changedBooks: OrderBookRow[] = [];
    const order = await withTenantTransaction(tenant, user, async (client) => {
        const existing = await findOrderRowById(client, orderId);
        if (!existing) throw new NotFoundError("ORDER_NOT_FOUND");
        if (existing.status === "pago") throw new ValidationError("ORDER_ALREADY_PAID");
        if (existing.status === "cancelado") throw new ValidationError("ORDER_ALREADY_CANCELLED");
        const items = (await listOrderItemRowsByOrder(client, orderId)).map((item) => item.snapshot);
        const row = await updateOrderRow(client, orderId, { status: "cancelado" });
        if (!row) throw new NotFoundError("ORDER_NOT_FOUND");
        const cancelledRows = await cancelOpenOrderSessionRowsByOrder(client, orderId);
        cancelledSessions = cancelledRows.map((cancelledRow) => toOrderSession(cancelledRow, items));
        const bookIds = new Set(cancelledRows.map((cancelledRow) => cancelledRow.order_book_id));
        changedBooks = (await Promise.all(
            [...bookIds].map((bookId) => closeOrderBookWhenFinished(client, bookId)),
        )).filter((book): book is OrderBookRow => Boolean(book));
        await recordAuditEvent(client, {
            action: ORDER_AUDIT_ACTIONS.MANUALLY_CANCELLED,
            entityId: orderId,
            actor: user,
            context: auditRequestContext,
            metadata: {},
        });
        const freightRow = await findOrderFreightRowByOrderId(client, orderId);
        return toOrder(row, items, freightRow);
    });
    for (const cancelledSession of cancelledSessions) notifySession(tenant.id, cancelledSession);
    for (const book of changedBooks) notifyOrderBook(tenant.id, toOrderBook(book));
    notifyOrder(tenant.id, order);
    const erpResult = await cancelProviderOrderForOrder(tenant, user, orderId, auditRequestContext);
    return { order, erpWarning: erpResult.cancelled ? undefined : erpResult.error };
}
