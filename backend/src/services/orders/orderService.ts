import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, CartItem, Order, OrderChannel, OrderSession } from "@/lib/types";
import {
    closeOrderSessionRow,
    findOrderSessionRow,
    listOrderItemRows,
    listOrderItemRowsByOrder,
    listOrderRowsBy,
    listTenantOrderRows,
    updateOrderRow,
} from "@/models/ordersModel";
import { getOrCreateOpenOrder, syncOrderItems } from "./orderItemSync";
import { deleteClientCartRows } from "@/models/clientsModel";
import { findUserRowById } from "@/models/usersModel";
import { findStoreSettingsRow } from "@/models/settingsModel";
import { notifyOrder, notifyOrderBook, notifySession } from "@/lib/sseHub";
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
): Promise<Order[]> {
    return withTenantTransaction(tenant, user, async (client) => {
        const [orders, items] = await Promise.all([
            isAdministrator(user)
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

export async function createCustomerOrder(
    tenant: Tenant,
    user: AuthUser,
    body: Record<string, unknown>,
): Promise<Order> {
    if (user.role !== "cliente" || !user.clientId) throw new ForbiddenError();
    if (
        !Array.isArray(body.items) ||
        typeof body.total !== "number" ||
        !Number.isFinite(body.total) ||
        typeof body.channel !== "string"
    )
        throw new ValidationError();
    const items = body.items as CartItem[];
    const requestedChannel = body.channel;
    let changedSession: OrderSession | undefined;
    const changes: { book?: OrderBookRow } = {};
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
        if (typeof body.sessionId === "string" && body.sessionId) {
            const session = await findOrderSessionRow(client, body.sessionId);
            if (session && session.client_id === user.clientId) {
                const settings = await findStoreSettingsRow(client);
                if (settings?.features?.clientSelfCheckout === false)
                    throw new ForbiddenError("SELF_CHECKOUT_DISABLED");
                sellerId = session.seller_id;
                orderId = session.order_id ?? undefined;
                itemsFromSession = Boolean(orderId);
                const closed = await closeOrderSessionRow(client, session.id);
                if (closed) changedSession = toOrderSession(closed, items);
                changes.book = (await closeOrderBookWhenFinished(client, session.order_book_id)) ?? undefined;
            }
        }
        const allowedChannels = new Set(["presencial", "whatsapp", "online"]);
        const channel = (allowedChannels.has(requestedChannel) ? requestedChannel : "online") as OrderChannel;
        // Sem sessão (autosserviço puro do catálogo): reaproveita pedido em
        // aberto se a cliente já tiver um (ex. checkout abandonado antes),
        // senão cria. Sem sincronização ao vivo enquanto ela navega -- os
        // itens só chegam aqui, completos, no instante do checkout.
        if (!orderId) orderId = (await getOrCreateOpenOrder(client, { clientId: user.clientId!, sellerId, clientName: user.name, channel }))?.id;
        if (!orderId) throw new ValidationError();
        let orderItems = items;
        if (itemsFromSession) {
            orderItems = (await listOrderItemRowsByOrder(client, orderId)).map((item) => item.snapshot);
        } else {
            const currentItems = (await listOrderItemRowsByOrder(client, orderId)).map((item) => item.snapshot);
            await syncOrderItems(client, { orderId, currentItems, nextItems: items, actorId: user.id, actorRole: user.role });
        }
        const row = await updateOrderRow(client, orderId, {
            status: "pago",
            total: body.total as number,
            shipping: body.shipping as Order["shipping"],
            paymentMethod:
                typeof body.paymentMethod === "string"
                    ? body.paymentMethod
                    : undefined,
            discount: body.discount as Order["discount"],
        });
        if (!row) throw new NotFoundError("ORDER_NOT_FOUND");
        if (sellerId) {
            const seller = await findUserRowById(client, sellerId);
            if (seller) sellerRecipient = { id: seller.id, role: seller.role };
        }
        await deleteClientCartRows(client, user.clientId!);
        return toOrder(row, orderItems);
    });
    if (changedSession) notifySession(tenant.id, changedSession);
    if (changes.book) notifyOrderBook(tenant.id, { sellerId: changes.book.seller_id });
    notifyOrder(tenant.id, order);
    notifyOrderConfirmed(tenant, user, order);
    if (sellerRecipient) notifyNewOrderForSeller(tenant, sellerRecipient, order);
    return order;
}
