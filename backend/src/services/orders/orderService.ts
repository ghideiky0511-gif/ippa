import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, Order, OrderChannel, OrderSession } from "@/lib/types";
import { CreateCustomerOrderInputSchema } from "@/contracts/orders";
import {
    closeOpenOrderSessionRowsByOrder,
    findOrderRowById,
    findOrderSessionRow,
    listOrderItemRows,
    listOrderItemRowsByOrder,
    listOrderRowsBy,
    listTenantOrderRows,
    updateOrderRow,
} from "@/models/ordersModel";
import { getOrCreateOpenOrder, syncOrderItems } from "./orderItemSync";
import { findUserRowById } from "@/models/usersModel";
import { findStoreSettingsRow } from "@/models/settingsModel";
import { notifyOrder, notifyOrderBook, notifySession } from "@/services/realtime/updateBroadcast";
import { notifyNewOrderForSeller, notifyOrderConfirmed } from "@/services/notifications";
import { ForbiddenError, NotFoundError, ValidationError } from "@/services/shared/errors";
import { toOrder, toOrderSession } from "./orderMapper";
import { closeOrderBookWhenFinished } from "./orderBookLifecycle";
import type { OrderBookRow } from "@/models/orderBooksModel";

function isAdministrator(user: AuthUser): boolean {
    return user.role === "administrador" && user.permissions?.adminAccess === true;
}

export async function userOrders(
    tenant: Tenant,
    user: AuthUser,
    filters?: { clientId?: string },
): Promise<Order[]> {
    if (filters?.clientId && !isAdministrator(user)) throw new ForbiddenError();
    return withTenantTransaction(tenant, user, async (client) => {
        const [orders, items] = await Promise.all([
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
        ]);
        return orders.map((order) =>
            toOrder(
                order,
                items
                    .filter((item) => item.order_id === order.id)
                    .map((item) => item.snapshot),
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
        if (!orderRow) throw new NotFoundError();
        const isOwnAsSeller = user.role === "vendedora" && orderRow.seller_id === user.id;
        const isOwnAsClient = user.role === "cliente" && user.clientId && orderRow.client_id === user.clientId;
        if (!isAdministrator(user) && !isOwnAsSeller && !isOwnAsClient) throw new ForbiddenError();
        const items = (await listOrderItemRowsByOrder(client, orderId)).map((item) => item.snapshot);
        return toOrder(orderRow, items);
    });
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
        // Sem motor de pagamentos de verdade, este checkout só confirma o
        // pedido (fecha o carrinho pra separação) -- não paga mais (ver
        // migration 036). paymentMethod fica sem uso até existir cobrança real.
        const row = await updateOrderRow(client, orderId, {
            status: "novo",
            total: body.total,
            shipping: body.shipping,
            discount: body.discount,
        });
        if (!row) throw new NotFoundError("ORDER_NOT_FOUND");
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
        return toOrder(row, orderItems);
    });
    for (const changedSession of changedSessions) notifySession(tenant.id, changedSession);
    for (const book of changedBooks) notifyOrderBook(tenant.id, { sellerId: book.seller_id });
    notifyOrder(tenant.id, order);
    notifyOrderConfirmed(tenant, user, order);
    if (sellerRecipient) notifyNewOrderForSeller(tenant, sellerRecipient, order);
    return order;
}
