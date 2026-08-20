import type { PoolClient } from "pg";
import type { CartItem, OrderChannel, UserRole } from "@/lib/types";
import {
    deleteOrderItemRow,
    findOpenOrderRowForAttachment,
    insertOrderItemEventRow,
    insertOrderRow,
    upsertOrderItemRow,
    type OrderRow,
} from "@/models/ordersModel";

// Upsell: um atendimento novo pra uma cliente que já tem pedido em aberto
// (não pago/cancelado) anexa nesse mesmo pedido em vez de criar um novo.
// sellerId undefined = checkout direto da cliente (sem vendedora) — só
// reaproveita pedido igualmente sem vendedora, nunca um de atendimento.
export async function getOrCreateOpenOrder(
    client: PoolClient,
    params: { clientId?: string; sellerId?: string; clientName: string; channel: OrderChannel },
): Promise<OrderRow | null> {
    if (!params.clientId) return null;
    const existing = await findOpenOrderRowForAttachment(client, { clientId: params.clientId, sellerId: params.sellerId });
    if (existing) return existing;
    return insertOrderRow(client, {
        clientId: params.clientId, sellerId: params.sellerId, clientName: params.clientName,
        channel: params.channel, status: "aberto", total: 0,
    });
}

// Só itens com qty > 0 viram linha em order_items (rascunho sem grade
// escolhida ainda não é "pedido real" -- ver order_items_qty_check).
// Reaproveitada tanto por quem já tem os itens atuais em mãos (diff real,
// upsell dentro de uma sessão viva) quanto por criação com lista vazia
// (tudo vira "item_added").
export async function syncOrderItems(
    client: PoolClient,
    params: { orderId: string; currentItems: CartItem[]; nextItems: CartItem[]; actorId: string; actorRole: UserRole },
): Promise<void> {
    const current = new Map(params.currentItems.filter((item) => item.qty > 0).map((item) => [item.key, item]));
    const next = new Map(params.nextItems.filter((item) => item.qty > 0).map((item) => [item.key, item]));

    for (const [key, item] of next) {
        const previous = current.get(key);
        await upsertOrderItemRow(client, params.orderId, item);
        if (!previous) {
            await insertOrderItemEventRow(client, {
                orderId: params.orderId, itemKey: key, eventType: "item_added",
                qtyDelta: item.qty, actorId: params.actorId, actorRole: params.actorRole,
            });
        } else if (previous.qty !== item.qty) {
            await insertOrderItemEventRow(client, {
                orderId: params.orderId, itemKey: key, eventType: "qty_adjusted",
                qtyDelta: item.qty - previous.qty, actorId: params.actorId, actorRole: params.actorRole,
            });
        }
    }
    for (const [key, item] of current) {
        if (next.has(key)) continue;
        await deleteOrderItemRow(client, params.orderId, key);
        await insertOrderItemEventRow(client, {
            orderId: params.orderId, itemKey: key, eventType: "item_removed",
            qtyDelta: -item.qty, actorId: params.actorId, actorRole: params.actorRole,
        });
    }
}
