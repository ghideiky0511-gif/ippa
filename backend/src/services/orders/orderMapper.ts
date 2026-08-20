import type { CartItem, Order, OrderSession } from "@/lib/types";
import type { OrderRow, OrderSessionRow } from "@/models/ordersModel";

export function toOrderSession(row: OrderSessionRow, items: CartItem[]): OrderSession {
    return {
        id: row.id,
        orderBookId: row.order_book_id,
        orderId: row.order_id ?? undefined,
        clientName: row.client_name,
        clientId: row.client_id ?? undefined,
        sellerId: row.seller_id,
        channel: row.channel,
        status: row.status,
        shipping: row.shipping ?? undefined,
        items,
        paymentTokenCreatedAt: row.payment_token_created_at?.toISOString(),
        notes: row.notes ?? undefined,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
    };
}

export function toOrder(row: OrderRow, items: CartItem[]): Order {
    return {
        id: row.id,
        date: row.created_at.toISOString(),
        updatedAt: row.updated_at?.toISOString(),
        status: row.status as Order["status"],
        items,
        total: Number(row.total),
        channel: row.channel,
        shipping: row.shipping ?? undefined,
        paymentMethod: row.payment_method ?? undefined,
        discount: row.discount ?? undefined,
        clientId: row.client_id ?? undefined,
        sellerId: row.seller_id ?? undefined,
        clientName: row.client_name ?? undefined,
    };
}
