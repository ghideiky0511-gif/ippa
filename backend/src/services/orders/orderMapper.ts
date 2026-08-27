import type { CartItem, Order, OrderBook, OrderSession } from "@/lib/types";
import { OrderChannelSchema } from "@/contracts/orders";
import type { OrderRow, OrderSessionRow } from "@/models/ordersModel";
import type { OrderBookRow } from "@/models/orderBooksModel";

export function toOrderSession(row: OrderSessionRow, items: CartItem[]): OrderSession {
    return {
        id: row.id,
        orderBookId: row.order_book_id,
        orderId: row.order_id ?? undefined,
        clientName: row.client_name,
        clientId: row.client_id ?? undefined,
        sellerId: row.seller_id,
        channel: OrderChannelSchema.catch("online").parse(row.channel),
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
        orderNumber: row.order_number,
        date: row.created_at.toISOString(),
        updatedAt: row.updated_at?.toISOString(),
        status: row.status as Order["status"],
        items,
        total: Number(row.total),
        channel: OrderChannelSchema.catch("online").parse(row.channel),
        shipping: row.shipping ?? undefined,
        paymentMethod: row.payment_method ?? undefined,
        discount: row.discount ?? undefined,
        clientId: row.client_id ?? undefined,
        sellerId: row.seller_id ?? undefined,
        clientName: row.client_name ?? undefined,
    };
}

export function toOrderBook(row: OrderBookRow): OrderBook {
    return {
        id: row.id,
        sellerId: row.seller_id,
        name: row.name,
        status: row.status,
        isActive: row.is_active,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
    };
}

/** Diff de itens de sessão pro evento incremental `session_items` — `set`
 * carrega o item inteiro com a qty ABSOLUTA (não o delta), pra convergir
 * mesmo em cima de uma atualização otimista local já aplicada. Compara por
 * `key` (não só qty): preço/backorderDate/suggested também contam como
 * mudança, senão o cliente que recebe o evento fica com um snapshot velho
 * desses campos. */
export function diffCartItems(before: CartItem[], after: CartItem[]): { set: CartItem[]; del: string[] } {
    const beforeByKey = new Map(before.map((item) => [item.key, item]));
    const afterByKey = new Map(after.map((item) => [item.key, item]));
    const set: CartItem[] = [];
    const del: string[] = [];
    for (const [key, item] of afterByKey) {
        const previous = beforeByKey.get(key);
        const changed = !previous
            || previous.qty !== item.qty
            || previous.price !== item.price
            || previous.backorderDate !== item.backorderDate
            || previous.suggested !== item.suggested;
        if (changed) set.push(item);
    }
    for (const key of beforeByKey.keys()) {
        if (!afterByKey.has(key)) del.push(key);
    }
    return { set, del };
}
