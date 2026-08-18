import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, CartItem, Order, OrderSession } from "@/lib/types";
import {
    closeOrderSessionRow,
    findOrderSessionRow,
    insertOrderItemRow,
    insertOrderRow,
    listOrderItemRows,
    listOrderRowsBy,
    listTenantOrderRows,
} from "@/models/ordersModel";
import { deleteClientCartRows } from "@/models/clientsModel";
import { findUserRowById } from "@/models/usersModel";
import { findStoreSettingsRow } from "@/models/settingsModel";
import { notifyOrder, notifySession } from "@/lib/sseHub";
import { notifyNewOrderForSeller, notifyOrderConfirmed } from "@/services/notifications";
import { ForbiddenError, ValidationError } from "@/services/shared/errors";
import { toOrder } from "./orderMapper";

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
                    : Promise.reject(new ForbiddenError()),
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
    let sellerRecipient: Pick<AuthUser, "id" | "role"> | undefined;
    const order = await withTenantTransaction(tenant, user, async (client) => {
        let sellerId: string | undefined;
        if (typeof body.sessionId === "string" && body.sessionId) {
            const session = await findOrderSessionRow(client, body.sessionId);
            if (session && session.client_id === user.clientId) {
                const settings = await findStoreSettingsRow(client);
                if (settings?.features?.clientSelfCheckout === false)
                    throw new ForbiddenError("SELF_CHECKOUT_DISABLED");
                sellerId = session.seller_id;
                const closed = await closeOrderSessionRow(client, session.id);
                if (closed)
                    changedSession = {
                        id: closed.id,
                        clientName: closed.client_name,
                        clientId: closed.client_id ?? undefined,
                        sellerId: closed.seller_id,
                        channel: closed.channel,
                        items,
                        status: closed.status,
                        shipping: closed.shipping ?? undefined,
                        notes: closed.notes ?? undefined,
                        createdAt: closed.created_at.toISOString(),
                        updatedAt: closed.updated_at.toISOString(),
                    };
            }
        }
        const allowedChannels = new Set(["presencial", "whatsapp", "online"]);
        const channel = allowedChannels.has(requestedChannel)
            ? requestedChannel
            : "online";
        const row = await insertOrderRow(client, {
            clientId: user.clientId,
            sellerId,
            clientName: user.name,
            channel,
            total: body.total as number,
            shipping: body.shipping as Order["shipping"],
            paymentMethod:
                typeof body.paymentMethod === "string"
                    ? body.paymentMethod
                    : undefined,
            discount: body.discount as Order["discount"],
        });
        for (const item of items)
            await insertOrderItemRow(client, row.id, item);
        if (sellerId) {
            const seller = await findUserRowById(client, sellerId);
            if (seller) sellerRecipient = { id: seller.id, role: seller.role };
        }
        await deleteClientCartRows(client, user.clientId!);
        return toOrder(row, items);
    });
    if (changedSession) notifySession(changedSession);
    notifyOrder(tenant.id, order);
    notifyOrderConfirmed(tenant, user, order);
    if (sellerRecipient) notifyNewOrderForSeller(tenant, sellerRecipient, order);
    return order;
}
