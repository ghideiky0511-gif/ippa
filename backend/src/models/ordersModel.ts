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

export async function listOrderSessionItemRows(client: PoolClient): Promise<OrderSessionItemRow[]> {
    const result = await client.query<OrderSessionItemRow>(
        "SELECT session_id, snapshot FROM order_session_items WHERE tenant_id = app_tenant_id()",
    );
    return result.rows;
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
