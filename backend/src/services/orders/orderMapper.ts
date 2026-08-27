import type { CartItem, FreightQuote, Order, OrderBook, OrderFreight, OrderSession, SessionFreight } from "@/lib/types";
import { OrderChannelSchema } from "@/contracts/orders";
import type { OrderRow, OrderSessionRow } from "@/models/ordersModel";
import type { OrderBookRow } from "@/models/orderBooksModel";
import type { OrderFreightRow } from "@/models/orderFreightsModel";
import type { FreightQuoteRow } from "@/models/freightQuotesModel";

export function toFreightQuote(row: FreightQuoteRow): FreightQuote {
    return {
        id: row.id,
        providerId: row.provider_id,
        kind: row.kind,
        label: row.label,
        price: Number(row.price),
        etaLabel: row.eta_label,
    };
}

export function sessionFreightFromRow(row: OrderSessionRow): SessionFreight | undefined {
    if (!row.freight_kind) return undefined;
    return {
        quoteId: row.freight_quote_id,
        providerId: row.freight_provider_id,
        kind: row.freight_kind,
        label: row.freight_label!,
        price: Number(row.freight_price),
        etaLabel: row.freight_eta_label,
    };
}

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
        freight: sessionFreightFromRow(row),
        items,
        paymentTokenCreatedAt: row.payment_token_created_at?.toISOString(),
        notes: row.notes ?? undefined,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
    };
}

export function toOrderFreight(row: OrderFreightRow): OrderFreight {
    return {
        id: row.id,
        providerId: row.provider_id,
        quoteId: row.quote_id,
        kind: row.kind,
        method: row.method,
        label: row.label,
        price: Number(row.price),
        etaLabel: row.eta_label,
        trackingCode: row.tracking_code,
        trackingUrl: row.tracking_url,
        status: row.status,
        shippedAt: row.shipped_at?.toISOString() ?? null,
        deliveredAt: row.delivered_at?.toISOString() ?? null,
        cancelledAt: row.cancelled_at?.toISOString() ?? null,
    };
}

export function toOrder(row: OrderRow, items: CartItem[], freightRow?: OrderFreightRow | null): Order {
    return {
        id: row.id,
        orderNumber: row.order_number,
        date: row.created_at.toISOString(),
        updatedAt: row.updated_at?.toISOString(),
        status: row.status as Order["status"],
        items,
        total: Number(row.total),
        channel: OrderChannelSchema.catch("online").parse(row.channel),
        freight: freightRow ? toOrderFreight(freightRow) : undefined,
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

/** Inverso de diffCartItems: aplica um delta set/del sobre uma lista de
 * itens conhecida (currentItems vindo do banco), pra resolver a lista
 * completa sem exigir que o cliente mande o carrinho inteiro a cada
 * mutação. */
export function applyCartItemsDelta(items: CartItem[], delta: { set: CartItem[]; del: string[] }): CartItem[] {
    const byKey = new Map(items.map((item) => [item.key, item]));
    for (const item of delta.set) byKey.set(item.key, item);
    for (const key of delta.del) byKey.delete(key);
    return Array.from(byKey.values());
}
