import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, Order } from "@/lib/types";
import { listOrderItemRows, listOrderRowsBy } from "@/models/ordersModel";
import { ForbiddenError } from "@/services/shared/errors";
import { toOrder } from "./orderMapper";

export async function userOrders(tenant: Tenant, user: AuthUser): Promise<Order[]> {
    let field: "client_id" | "seller_id";
    let id: string;
    if (user.role === "cliente" && user.clientId) {
        field = "client_id";
        id = user.clientId;
    } else if (user.role === "vendedora") {
        field = "seller_id";
        id = user.id;
    } else {
        throw new ForbiddenError();
    }

    return withTenantTransaction(tenant, user, async (client) => {
        const [orders, items] = await Promise.all([
            listOrderRowsBy(client, field, id),
            listOrderItemRows(client),
        ]);
        return orders.map((order) => toOrder(
            order,
            items.filter((item) => item.order_id === order.id).map((item) => item.snapshot),
        ));
    });
}
