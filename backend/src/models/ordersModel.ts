import type { PoolClient } from "pg";
import type { CartItem, Order, OrderSession } from "@/lib/types";

export interface OrderSessionRow {
    id: string; order_book_id: string; client_name: string; client_id: string | null; seller_id: string;
    channel: OrderSession["channel"]; status: OrderSession["status"]; order_id: string | null;
    shipping: OrderSession["shipping"]; payment_token_created_at: Date | null;
    notes: string | null; created_at: Date; updated_at: Date;
}
export interface OrderSessionItemRow { session_id: string; snapshot: CartItem }
export interface OrderRow {
    id: string; created_at: Date; updated_at: Date; client_id: string | null; seller_id: string | null;
    client_name: string | null; channel: string; status: string; total: string;
    shipping: Order["shipping"]; payment_method: string | null; discount: Order["discount"];
}
export interface OrderItemRow { order_id: string; item_key: string; snapshot: CartItem }

const sessionFields = "id, order_book_id, client_name, client_id, seller_id, channel, status, order_id, shipping, payment_token_created_at, notes, created_at, updated_at";

export async function listOrderSessionRowsBySeller(client: PoolClient, sellerId: string): Promise<OrderSessionRow[]> {
    const result = await client.query<OrderSessionRow>(
        `SELECT ${sessionFields} FROM order_sessions
         WHERE tenant_id = app_tenant_id() AND seller_id = $1 ORDER BY updated_at DESC`, [sellerId],
    );
    return result.rows;
}

export async function listTenantOrderSessionRows(client: PoolClient): Promise<OrderSessionRow[]> {
    const result = await client.query<OrderSessionRow>(
        `SELECT ${sessionFields} FROM order_sessions
         WHERE tenant_id = app_tenant_id() ORDER BY updated_at DESC`,
    );
    return result.rows;
}

export async function listOrderSessionRowsByBook(client: PoolClient, orderBookId: string): Promise<OrderSessionRow[]> {
    const result = await client.query<OrderSessionRow>(
        `SELECT ${sessionFields} FROM order_sessions
         WHERE tenant_id = app_tenant_id() AND order_book_id = $1 ORDER BY updated_at DESC`,
        [orderBookId],
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
         WHERE tenant_id = app_tenant_id() AND client_id = $1 AND status IN ('aberto', 'aguardando_pagamento')
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

export async function listOrderSessionItemRowsByBook(client: PoolClient, orderBookId: string): Promise<OrderSessionItemRow[]> {
    const result = await client.query<OrderSessionItemRow>(
        `SELECT item.session_id, item.snapshot
         FROM order_session_items AS item
         INNER JOIN order_sessions AS session ON session.id = item.session_id
         WHERE item.tenant_id = app_tenant_id() AND session.tenant_id = app_tenant_id()
           AND session.order_book_id = $1`,
        [orderBookId],
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
        `INSERT INTO order_sessions (tenant_id, order_book_id, client_name, client_id, seller_id, channel, status, order_id, shipping, notes)
         VALUES (app_tenant_id(), $1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING ${sessionFields}`,
        [value.orderBookId, value.clientName, value.clientId ?? null, value.sellerId, value.channel, value.status,
         value.orderId ?? null, value.shipping ? JSON.stringify(value.shipping) : null, value.notes ?? null],
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
    clientName: string; clientId?: string; status: OrderSession["status"]; orderId?: string;
    shipping?: OrderSession["shipping"]; notes?: string; clearPaymentToken?: boolean;
}): Promise<OrderSessionRow | null> {
    const result = await client.query<OrderSessionRow>(
        `UPDATE order_sessions SET client_name = $2, client_id = $3, status = $4,
           order_id = COALESCE($8, order_id),
           shipping = $5, notes = $6,
           payment_token_hash = CASE WHEN $7 THEN NULL ELSE payment_token_hash END,
           payment_token_created_at = CASE WHEN $7 THEN NULL ELSE payment_token_created_at END,
           updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1
         RETURNING ${sessionFields}`,
        [id, value.clientName, value.clientId ?? null, value.status,
         value.shipping ? JSON.stringify(value.shipping) : null, value.notes ?? null,
         value.clearPaymentToken === true, value.orderId ?? null],
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

// Upsell reaproveita o mesmo order_id entre sessões de talões diferentes
// (ver createOrderSession/ensureCustomerOrderSession). Pagar uma delas fecha
// o pedido inteiro, então toda sessão irmã ainda aberta precisa fechar junto
// -- senão ela fica "aberta" na tela apontando pra um pedido já finalizado,
// e qualquer edição nela quebra com ORDER_ALREADY_FINALIZED.
export async function closeOpenOrderSessionRowsByOrder(client: PoolClient, orderId: string): Promise<OrderSessionRow[]> {
    const result = await client.query<OrderSessionRow>(
        `UPDATE order_sessions SET status = 'fechado', payment_token_hash = NULL,
           payment_token_created_at = NULL, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND order_id = $1
           AND status IN ('aberto', 'aguardando_pagamento')
         RETURNING ${sessionFields}`,
        [orderId],
    );
    return result.rows;
}

export async function cancelOpenOrderSessionRowsByBook(client: PoolClient, orderBookId: string): Promise<OrderSessionRow[]> {
    const result = await client.query<OrderSessionRow>(
        `UPDATE order_sessions SET status = 'cancelado', payment_token_hash = NULL,
           payment_token_created_at = NULL, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND order_book_id = $1
           AND status IN ('aberto', 'aguardando_pagamento')
         RETURNING ${sessionFields}`,
        [orderBookId],
    );
    return result.rows;
}

export async function listOrderRowsBy(client: PoolClient, field: "client_id" | "seller_id", id: string): Promise<OrderRow[]> {
    const result = await client.query<OrderRow>(
        `SELECT ${orderFields} FROM orders WHERE tenant_id = app_tenant_id() AND ${field} = $1 ORDER BY created_at DESC`, [id],
    );
    return result.rows;
}

/** Lista o histórico completo do tenant. A autorização fica no serviço. */
export async function listTenantOrderRows(client: PoolClient): Promise<OrderRow[]> {
    const result = await client.query<OrderRow>(
        `SELECT ${orderFields} FROM orders WHERE tenant_id = app_tenant_id() ORDER BY created_at DESC`,
    );
    return result.rows;
}

export async function listOrderItemRows(client: PoolClient): Promise<OrderItemRow[]> {
    const result = await client.query<OrderItemRow>(
        "SELECT order_id, item_key, snapshot FROM order_items WHERE tenant_id = app_tenant_id()",
    );
    return result.rows;
}

export async function listOrderItemRowsByOrder(client: PoolClient, orderId: string): Promise<OrderItemRow[]> {
    const result = await client.query<OrderItemRow>(
        `SELECT order_id, item_key, snapshot FROM order_items
         WHERE tenant_id = app_tenant_id() AND order_id = $1`, [orderId],
    );
    return result.rows;
}

export interface OrderWriteRow {
    clientId?: string; sellerId?: string; clientName?: string; channel: string;
    // Default 'pago': todo caminho que ainda não foi migrado pra criar o
    // pedido antes do pagamento (ex. sync do ERP, que importa pedido já
    // fechado) continua inserindo o registro pronto, sem passar status.
    status?: Order["status"];
    total: number; shipping?: Order["shipping"]; paymentMethod?: string; discount?: Order["discount"];
    // Data original do pedido (ex. vinda do ERP) — sem valor, cai no now()
    // do banco (pedido criado agora mesmo, fluxo local de sempre).
    createdAt?: string;
}

const orderFields = "id, created_at, updated_at, client_id, seller_id, client_name, channel, status, total, shipping, payment_method, discount";

export async function insertOrderRow(client: PoolClient, value: OrderWriteRow): Promise<OrderRow> {
    const result = await client.query<OrderRow>(
        `INSERT INTO orders (tenant_id, client_id, seller_id, client_name, channel, status, total, shipping, payment_method, discount, created_at)
         VALUES (app_tenant_id(), $1,$2,$3,$4,$5,$6,$7,$8,$9, COALESCE($10, now()))
         RETURNING ${orderFields}`,
        [value.clientId ?? null, value.sellerId ?? null, value.clientName ?? null, value.channel,
         value.status ?? "pago", value.total, value.shipping ? JSON.stringify(value.shipping) : null,
         value.paymentMethod ?? null, value.discount ? JSON.stringify(value.discount) : null,
         value.createdAt ?? null],
    );
    return result.rows[0];
}

export async function findOrderRowById(client: PoolClient, id: string): Promise<OrderRow | null> {
    const result = await client.query<OrderRow>(
        `SELECT ${orderFields} FROM orders WHERE tenant_id = app_tenant_id() AND id = $1`, [id],
    );
    return result.rows[0] ?? null;
}

// Pedido aberto (ainda não pago/cancelado) pra anexar um novo atendimento —
// upsell. sellerId undefined/null busca só pedidos sem vendedora (checkout
// direto da cliente pelo catálogo); com sellerId, só casa pedidos da MESMA
// vendedora (order_books já é por vendedora hoje — atendimentos de
// vendedoras diferentes não compartilham pedido).
export async function findOpenOrderRowForAttachment(
    client: PoolClient,
    params: { clientId: string; sellerId?: string },
): Promise<OrderRow | null> {
    const result = await client.query<OrderRow>(
        `SELECT ${orderFields} FROM orders
         WHERE tenant_id = app_tenant_id() AND client_id = $1 AND seller_id IS NOT DISTINCT FROM $2
           AND status IN ('aberto', 'aguardando_pagamento')
         ORDER BY created_at DESC LIMIT 1`,
        [params.clientId, params.sellerId ?? null],
    );
    return result.rows[0] ?? null;
}

export async function updateOrderRow(client: PoolClient, id: string, value: {
    status: Order["status"]; total?: number; paymentMethod?: string;
    discount?: Order["discount"]; shipping?: Order["shipping"];
}): Promise<OrderRow | null> {
    const result = await client.query<OrderRow>(
        `UPDATE orders SET status = $2, total = COALESCE($3, total),
           payment_method = COALESCE($4, payment_method),
           discount = COALESCE($5::jsonb, discount),
           shipping = COALESCE($6::jsonb, shipping), updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1
         RETURNING ${orderFields}`,
        [id, value.status, value.total ?? null, value.paymentMethod ?? null,
         value.discount ? JSON.stringify(value.discount) : null,
         value.shipping ? JSON.stringify(value.shipping) : null],
    );
    return result.rows[0] ?? null;
}

// Upsert por (tenant_id, order_id, item_key) -- a mesma linha muda de
// valor em vez de trocar de identidade, o que é o que permite ter
// order_item_events como histórico de verdade em cima dela. variant_id é
// resolvido por (product_id, color, size); sem casar, fica NULL (produto
// sem grade cadastrada, ou peça ainda em rascunho).
export async function upsertOrderItemRow(client: PoolClient, orderId: string, item: CartItem): Promise<void> {
    await client.query(
        `INSERT INTO order_items (tenant_id, order_id, item_key, product_id, variant_id, qty, unit_price, snapshot)
         SELECT app_tenant_id(), $1, $2, $3,
           (SELECT pv.id FROM product_variants pv
              WHERE pv.tenant_id = app_tenant_id() AND pv.product_id = $3 AND pv.color = $4 AND pv.size = $5),
           $6, $7, $8
         ON CONFLICT (tenant_id, order_id, item_key) DO UPDATE SET
           product_id = EXCLUDED.product_id, variant_id = EXCLUDED.variant_id,
           qty = EXCLUDED.qty, unit_price = EXCLUDED.unit_price, snapshot = EXCLUDED.snapshot`,
        [orderId, item.key, item.id || null, item.color ?? null, item.size ?? null, item.qty, item.price, JSON.stringify(item)],
    );
}

export async function deleteOrderItemRow(client: PoolClient, orderId: string, itemKey: string): Promise<void> {
    await client.query(
        `DELETE FROM order_items WHERE tenant_id = app_tenant_id() AND order_id = $1 AND item_key = $2`,
        [orderId, itemKey],
    );
}

export interface OrderItemEventInput {
    orderId: string; itemKey: string; eventType: "item_added" | "item_removed" | "qty_adjusted";
    qtyDelta: number; actorId: string; actorRole: string;
}

export async function insertOrderItemEventRow(client: PoolClient, event: OrderItemEventInput): Promise<void> {
    await client.query(
        `INSERT INTO order_item_events (tenant_id, order_id, item_key, event_type, qty_delta, actor_id, actor_role)
         VALUES (app_tenant_id(), $1, $2, $3, $4, $5, $6)`,
        [event.orderId, event.itemKey, event.eventType, event.qtyDelta, event.actorId, event.actorRole],
    );
}
