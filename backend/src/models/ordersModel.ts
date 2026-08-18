import type { PoolClient } from "pg";
import type { CartItem, Order, OrderSession } from "@/lib/types";

export interface OrderSessionRow {
    id: string; client_name: string; client_id: string | null; seller_id: string;
    channel: OrderSession["channel"]; status: OrderSession["status"];
    shipping: OrderSession["shipping"]; payment_token_created_at: Date | null;
    notes: string | null; created_at: Date; updated_at: Date;
}
export interface OrderSessionItemRow { session_id: string; snapshot: CartItem }
export interface OrderRow {
    id: string; created_at: Date; client_id: string | null; seller_id: string | null;
    client_name: string | null; channel: string; total: string;
    shipping: Order["shipping"]; payment_method: string | null; discount: Order["discount"];
}
export interface OrderItemRow { order_id: string; snapshot: CartItem }

const sessionFields = "id, client_name, client_id, seller_id, channel, status, shipping, payment_token_created_at, notes, created_at, updated_at";

export async function listOrderSessionRowsBySeller(client: PoolClient, sellerId: string): Promise<OrderSessionRow[]> {
    const result = await client.query<OrderSessionRow>(
        `SELECT ${sessionFields} FROM order_sessions
         WHERE tenant_id = app_tenant_id() AND seller_id = $1 ORDER BY updated_at DESC`, [sellerId],
    );
    return result.rows;
}

export async function findOrderSessionRow(client: PoolClient, id: string): Promise<OrderSessionRow | null> {
    const result = await client.query<OrderSessionRow>(
        `SELECT ${sessionFields} FROM order_sessions
         WHERE tenant_id = app_tenant_id() AND id = $1`, [id],
    );
    return result.rows[0] ?? null;
}

export async function findOrderSessionRowByPaymentTokenHash(
    client: PoolClient,
    tokenHash: string,
    lock = false,
): Promise<OrderSessionRow | null> {
    const result = await client.query<OrderSessionRow>(
        `SELECT ${sessionFields} FROM order_sessions
         WHERE tenant_id = app_tenant_id() AND payment_token_hash = $1${lock ? " FOR UPDATE" : ""}`, [tokenHash],
    );
    return result.rows[0] ?? null;
}

export async function findLatestOpenOrderSessionRowByClient(client: PoolClient, clientId: string): Promise<OrderSessionRow | null> {
    const result = await client.query<OrderSessionRow>(
        `SELECT ${sessionFields} FROM order_sessions
         WHERE tenant_id = app_tenant_id() AND client_id = $1 AND status = 'aberto'
         ORDER BY updated_at DESC LIMIT 1`, [clientId],
    );
    return result.rows[0] ?? null;
}

export async function listOrderSessionItemRows(client: PoolClient): Promise<OrderSessionItemRow[]> {
    const result = await client.query<OrderSessionItemRow>(
        "SELECT session_id, snapshot FROM order_session_items WHERE tenant_id = app_tenant_id()",
    );
    return result.rows;
}

export async function listOrderSessionItemRowsBySession(client: PoolClient, sessionId: string): Promise<OrderSessionItemRow[]> {
    const result = await client.query<OrderSessionItemRow>(
        `SELECT session_id, snapshot FROM order_session_items
         WHERE tenant_id = app_tenant_id() AND session_id = $1`, [sessionId],
    );
    return result.rows;
}

export async function countOpenOrderSessionRowsBySeller(client: PoolClient): Promise<Record<string, number>> {
    const result = await client.query<{ seller_id: string; count: string }>(
        `SELECT seller_id, count(*)::text AS count FROM order_sessions
         WHERE tenant_id = app_tenant_id() AND status IN ('aberto', 'aguardando_pagamento')
         GROUP BY seller_id`,
    );
    return Object.fromEntries(result.rows.map((row) => [row.seller_id, Number(row.count)]));
}

export async function insertOrderSessionRow(
    client: PoolClient,
    value: Omit<OrderSession, "id" | "items" | "createdAt" | "updatedAt">,
): Promise<OrderSessionRow> {
    const result = await client.query<OrderSessionRow>(
        `INSERT INTO order_sessions (tenant_id, client_name, client_id, seller_id, channel, status, shipping, notes)
         VALUES (app_tenant_id(), $1,$2,$3,$4,$5,$6,$7)
         RETURNING ${sessionFields}`,
        [value.clientName, value.clientId ?? null, value.sellerId, value.channel, value.status,
         value.shipping ? JSON.stringify(value.shipping) : null, value.notes ?? null],
    );
    return result.rows[0];
}

export async function insertOrderSessionItemRow(client: PoolClient, sessionId: string, item: CartItem): Promise<void> {
    await client.query(
        `INSERT INTO order_session_items (tenant_id, session_id, item_key, product_id, snapshot)
         VALUES (app_tenant_id(), $1, $2, $3, $4)`,
        [sessionId, item.key, item.id || null, JSON.stringify(item)],
    );
}

export async function replaceOrderSessionItemRows(client: PoolClient, sessionId: string, items: CartItem[]): Promise<void> {
    await client.query(
        `DELETE FROM order_session_items WHERE tenant_id = app_tenant_id() AND session_id = $1`,
        [sessionId],
    );
    for (const item of items) await insertOrderSessionItemRow(client, sessionId, item);
}

export async function updateOrderSessionRow(client: PoolClient, id: string, value: {
    clientName: string; clientId?: string; status: OrderSession["status"];
    shipping?: OrderSession["shipping"]; notes?: string; clearPaymentToken?: boolean;
}): Promise<OrderSessionRow | null> {
    const result = await client.query<OrderSessionRow>(
        `UPDATE order_sessions SET client_name = $2, client_id = $3, status = $4,
           shipping = $5, notes = $6,
           payment_token_hash = CASE WHEN $7 THEN NULL ELSE payment_token_hash END,
           payment_token_created_at = CASE WHEN $7 THEN NULL ELSE payment_token_created_at END,
           updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1
         RETURNING ${sessionFields}`,
        [id, value.clientName, value.clientId ?? null, value.status,
         value.shipping ? JSON.stringify(value.shipping) : null, value.notes ?? null,
         value.clearPaymentToken === true],
    );
    return result.rows[0] ?? null;
}

export async function setOrderSessionPaymentTokenRow(
    client: PoolClient,
    id: string,
    tokenHash: string,
): Promise<OrderSessionRow | null> {
    const result = await client.query<OrderSessionRow>(
        `UPDATE order_sessions SET payment_token_hash = $2, payment_token_created_at = now(),
           status = 'aguardando_pagamento', updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1
         RETURNING ${sessionFields}`,
        [id, tokenHash],
    );
    return result.rows[0] ?? null;
}

export async function closeOrderSessionRow(client: PoolClient, id: string): Promise<OrderSessionRow | null> {
    const result = await client.query<OrderSessionRow>(
        `UPDATE order_sessions SET status = 'fechado', payment_token_hash = NULL,
           payment_token_created_at = NULL, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1
         RETURNING ${sessionFields}`,
        [id],
    );
    return result.rows[0] ?? null;
}

export async function listOrderRowsBy(client: PoolClient, field: "client_id" | "seller_id", id: string): Promise<OrderRow[]> {
    const result = await client.query<OrderRow>(
        `SELECT id, created_at, client_id, seller_id, client_name, channel, total, shipping, payment_method, discount
         FROM orders WHERE tenant_id = app_tenant_id() AND ${field} = $1 ORDER BY created_at DESC`, [id],
    );
    return result.rows;
}

export async function listOrderItemRows(client: PoolClient): Promise<OrderItemRow[]> {
    const result = await client.query<OrderItemRow>(
        "SELECT order_id, snapshot FROM order_items WHERE tenant_id = app_tenant_id()",
    );
    return result.rows;
}

export interface OrderWriteRow {
    clientId?: string; sellerId?: string; clientName?: string; channel: string;
    total: number; shipping?: Order["shipping"]; paymentMethod?: string; discount?: Order["discount"];
    // Data original do pedido (ex. vinda do ERP) — sem valor, cai no now()
    // do banco (pedido criado agora mesmo, fluxo local de sempre).
    createdAt?: string;
}

const orderFields = "id, created_at, client_id, seller_id, client_name, channel, total, shipping, payment_method, discount";

// Pedidos são registro histórico imutável (não existe updateOrderRow, igual
// audit_events) — um pedido vindo do ERP é inserido uma única vez; syncs
// seguintes reconhecem o external_id já reconciliado e pulam.
export async function insertOrderRow(client: PoolClient, value: OrderWriteRow): Promise<OrderRow> {
    const result = await client.query<OrderRow>(
        `INSERT INTO orders (tenant_id, client_id, seller_id, client_name, channel, total, shipping, payment_method, discount, created_at)
         VALUES (app_tenant_id(), $1,$2,$3,$4,$5,$6,$7,$8, COALESCE($9, now()))
         RETURNING ${orderFields}`,
        [value.clientId ?? null, value.sellerId ?? null, value.clientName ?? null, value.channel,
         value.total, value.shipping ? JSON.stringify(value.shipping) : null,
         value.paymentMethod ?? null, value.discount ? JSON.stringify(value.discount) : null,
         value.createdAt ?? null],
    );
    return result.rows[0];
}

export async function insertOrderItemRow(client: PoolClient, orderId: string, item: CartItem): Promise<void> {
    await client.query(
        `INSERT INTO order_items (tenant_id, order_id, item_key, product_id, snapshot)
         VALUES (app_tenant_id(), $1, $2, $3, $4)`,
        [orderId, item.key, item.id || null, JSON.stringify(item)],
    );
}
