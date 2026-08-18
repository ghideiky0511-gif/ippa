import type { PoolClient } from 'pg';
import type { CartItem, Order, OrderSession } from '@/lib/types';

function mapSession(row: { id: string; client_name: string; client_id: string | null; seller_id: string; channel: OrderSession['channel']; status: OrderSession['status']; shipping: OrderSession['shipping']; payment_token_created_at: Date | null; notes: string | null; created_at: Date; updated_at: Date }, items: CartItem[]): OrderSession {
  return { id: row.id, clientName: row.client_name, clientId: row.client_id ?? undefined, sellerId: row.seller_id, channel: row.channel, status: row.status, shipping: row.shipping ?? undefined, items, paymentTokenCreatedAt: row.payment_token_created_at?.toISOString(), notes: row.notes ?? undefined, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() };
}

export async function listSessionsForSeller(client: PoolClient, sellerId: string): Promise<OrderSession[]> {
  const sessions = await client.query<{ id: string; client_name: string; client_id: string | null; seller_id: string; channel: OrderSession['channel']; status: OrderSession['status']; shipping: OrderSession['shipping']; payment_token_created_at: Date | null; notes: string | null; created_at: Date; updated_at: Date }>(
    `SELECT id, client_name, client_id, seller_id, channel, status, shipping, payment_token_created_at, notes, created_at, updated_at
     FROM order_sessions WHERE tenant_id = app_tenant_id() AND seller_id = $1 ORDER BY updated_at DESC`, [sellerId],
  );
  const items = await client.query<{ session_id: string; snapshot: CartItem }>(`SELECT session_id, snapshot FROM order_session_items WHERE tenant_id = app_tenant_id()`);
  return sessions.rows.map((session) => mapSession(session, items.rows.filter((item) => item.session_id === session.id).map((item) => item.snapshot)));
}

export async function insertSession(client: PoolClient, value: Omit<OrderSession, 'id' | 'createdAt' | 'updatedAt'>): Promise<OrderSession> {
  const result = await client.query<{ id: string; client_name: string; client_id: string | null; seller_id: string; channel: OrderSession['channel']; status: OrderSession['status']; shipping: OrderSession['shipping']; payment_token_created_at: Date | null; notes: string | null; created_at: Date; updated_at: Date }>(
    `INSERT INTO order_sessions (tenant_id, client_name, client_id, seller_id, channel, status, shipping, notes)
     VALUES (app_tenant_id(), $1,$2,$3,$4,$5,$6,$7)
     RETURNING id, client_name, client_id, seller_id, channel, status, shipping, payment_token_created_at, notes, created_at, updated_at`,
    [value.clientName, value.clientId ?? null, value.sellerId, value.channel, value.status, value.shipping ? JSON.stringify(value.shipping) : null, value.notes ?? null],
  );
  for (const item of value.items) {
    await client.query(`INSERT INTO order_session_items (tenant_id, session_id, item_key, product_id, snapshot) VALUES (app_tenant_id(), $1, $2, $3, $4)`, [result.rows[0].id, item.key, item.id || null, JSON.stringify(item)]);
  }
  return mapSession(result.rows[0], value.items);
}

export async function listOrders(client: PoolClient, field: 'client_id' | 'seller_id', id: string): Promise<Order[]> {
  const result = await client.query<{ id: string; created_at: Date; client_id: string | null; seller_id: string | null; client_name: string | null; channel: string; total: string; shipping: Order['shipping']; payment_method: string | null; discount: Order['discount'] }>(
    `SELECT id, created_at, client_id, seller_id, client_name, channel, total, shipping, payment_method, discount FROM orders
     WHERE tenant_id = app_tenant_id() AND ${field} = $1 ORDER BY created_at DESC`, [id],
  );
  const items = await client.query<{ order_id: string; snapshot: CartItem }>(`SELECT order_id, snapshot FROM order_items WHERE tenant_id = app_tenant_id()`);
  return result.rows.map((order) => ({ id: order.id, date: order.created_at.toISOString(), items: items.rows.filter((item) => item.order_id === order.id).map((item) => item.snapshot), total: Number(order.total), channel: order.channel, shipping: order.shipping ?? undefined, paymentMethod: order.payment_method ?? undefined, discount: order.discount ?? undefined, clientId: order.client_id ?? undefined, sellerId: order.seller_id ?? undefined, clientName: order.client_name ?? undefined }));
}
