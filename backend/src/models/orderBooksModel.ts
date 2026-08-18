import type { PoolClient } from "pg";
import type { OrderBook } from "@/lib/types";

export interface OrderBookRow {
    id: string;
    seller_id: string;
    name: string;
    status: OrderBook["status"];
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}

const fields = "id, seller_id, name, status, is_active, created_at, updated_at";

export async function listOrderBookRowsBySeller(client: PoolClient, sellerId: string): Promise<OrderBookRow[]> {
    const result = await client.query<OrderBookRow>(
        `SELECT ${fields} FROM order_books
         WHERE tenant_id = app_tenant_id() AND seller_id = $1
         ORDER BY is_active DESC, updated_at DESC`,
        [sellerId],
    );
    return result.rows;
}

export async function findOrderBookRow(client: PoolClient, id: string): Promise<OrderBookRow | null> {
    const result = await client.query<OrderBookRow>(
        `SELECT ${fields} FROM order_books WHERE tenant_id = app_tenant_id() AND id = $1`,
        [id],
    );
    return result.rows[0] ?? null;
}

export async function findActiveOrderBookRow(client: PoolClient, sellerId: string): Promise<OrderBookRow | null> {
    const result = await client.query<OrderBookRow>(
        `SELECT ${fields} FROM order_books
         WHERE tenant_id = app_tenant_id() AND seller_id = $1 AND is_active AND status = 'aberto'
         LIMIT 1`,
        [sellerId],
    );
    return result.rows[0] ?? null;
}

export async function insertOrderBookRow(client: PoolClient, sellerId: string, name: string): Promise<OrderBookRow> {
    // A ativação é transacional: o índice parcial garante que nunca existam
    // dois talões abertos e ativos para a mesma pessoa.
    await client.query(
        `UPDATE order_books SET is_active = false, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND seller_id = $1 AND is_active`,
        [sellerId],
    );
    const result = await client.query<OrderBookRow>(
        `INSERT INTO order_books (tenant_id, seller_id, name, status, is_active)
         VALUES (app_tenant_id(), $1, $2, 'aberto', true)
         RETURNING ${fields}`,
        [sellerId, name],
    );
    return result.rows[0];
}

export async function activateOrderBookRow(client: PoolClient, id: string, sellerId: string): Promise<OrderBookRow | null> {
    await client.query(
        `UPDATE order_books SET is_active = false, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND seller_id = $1 AND is_active`,
        [sellerId],
    );
    const result = await client.query<OrderBookRow>(
        `UPDATE order_books SET is_active = true, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1 AND seller_id = $2 AND status = 'aberto'
         RETURNING ${fields}`,
        [id, sellerId],
    );
    return result.rows[0] ?? null;
}
