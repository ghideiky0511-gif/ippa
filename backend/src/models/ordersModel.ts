import type { PoolClient } from "pg";
import type { CartItem, DeliveryFulfillmentMode, FreightProviderKind, Order, OrderSession } from "@/lib/types";

export interface OrderSessionRow {
    id: string; order_book_id: string; client_name: string; client_id: string | null; seller_id: string;
    channel: OrderSession["channel"]; status: OrderSession["status"]; order_id: string | null;
    freight_quote_id: string | null; freight_provider_id: string | null; freight_kind: FreightProviderKind | null;
    freight_label: string | null; freight_price: string | null; freight_eta_label: string | null;
    delivery_type_id: string | null; delivery_offering_id: string | null; delivery_provider_id: string | null;
    delivery_fulfillment_mode: DeliveryFulfillmentMode | null;
    delivery_type_name: string | null; delivery_provider_name: string | null;
    delivery_destination_cep: string | null;
    payment_token_created_at: Date | null;
    notes: string | null; created_at: Date; updated_at: Date;
}
export interface OrderSessionItemRow { session_id: string; snapshot: CartItem }
export interface OrderRow {
    id: string; order_number: number; created_at: Date; updated_at: Date; client_id: string | null; seller_id: string | null;
    client_name: string | null; channel: string; status: Order["status"]; total: string;
    payment_method: string | null; discount: Order["discount"];
    payment_status: NonNullable<Order["paymentStatus"]>; paid_at: Date | null;
}
export interface OrderItemRow { order_id: string; item_key: string; snapshot: CartItem }

const sessionFields = "id, order_book_id, client_name, client_id, seller_id, channel, status, order_id, freight_quote_id, freight_provider_id, freight_kind, freight_label, freight_price, freight_eta_label, delivery_type_id, delivery_offering_id, delivery_provider_id, delivery_fulfillment_mode, delivery_type_name, delivery_provider_name, delivery_destination_cep, payment_token_created_at, notes, created_at, updated_at";

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
    value: Omit<OrderSession, "id" | "items" | "createdAt" | "updatedAt" | "freight">,
): Promise<OrderSessionRow> {
    const result = await client.query<OrderSessionRow>(
        `INSERT INTO order_sessions (tenant_id, order_book_id, client_name, client_id, seller_id, channel, status, order_id, notes)
         VALUES (app_tenant_id(), $1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING ${sessionFields}`,
        [value.orderBookId, value.clientName, value.clientId ?? null, value.sellerId, value.channel, value.status,
         value.orderId ?? null, value.notes ?? null],
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

// Escreve só as linhas que mudaram (set = upsert por item_key, del = delete
// pelas keys) em vez de apagar e reinserir a sessão inteira a cada mutação
// -- ver applyCartItemsDelta/diffCartItems em orderMapper.ts, mesmo par
// set/del usado no evento de broadcast `session_items`.
export async function applyOrderSessionItemDeltaRows(
    client: PoolClient,
    sessionId: string,
    delta: { set: CartItem[]; del: string[] },
): Promise<void> {
    for (const item of delta.set) {
        await client.query(
            `INSERT INTO order_session_items (tenant_id, session_id, item_key, product_id, snapshot)
             VALUES (app_tenant_id(), $1, $2, $3, $4)
             ON CONFLICT (tenant_id, session_id, item_key)
             DO UPDATE SET product_id = excluded.product_id, snapshot = excluded.snapshot`,
            [sessionId, item.key, item.id || null, JSON.stringify(item)],
        );
    }
    if (delta.del.length > 0) {
        await client.query(
            `DELETE FROM order_session_items WHERE tenant_id = app_tenant_id() AND session_id = $1 AND item_key = ANY($2)`,
            [sessionId, delta.del],
        );
    }
}

export async function updateOrderSessionRow(client: PoolClient, id: string, value: {
    clientName: string; clientId?: string; status: OrderSession["status"]; orderId?: string;
    notes?: string; clearPaymentToken?: boolean;
}): Promise<OrderSessionRow | null> {
    const result = await client.query<OrderSessionRow>(
        `UPDATE order_sessions SET client_name = $2, client_id = $3, status = $4,
           order_id = COALESCE($7, order_id),
           notes = $5,
           payment_token_hash = CASE WHEN $6 THEN NULL ELSE payment_token_hash END,
           payment_token_created_at = CASE WHEN $6 THEN NULL ELSE payment_token_created_at END,
           updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1
         RETURNING ${sessionFields}`,
        [id, value.clientName, value.clientId ?? null, value.status, value.notes ?? null,
         value.clearPaymentToken === true, value.orderId ?? null],
    );
    return result.rows[0] ?? null;
}

// Snapshot da cotação escolhida (ver freightQuotesModel.selectFreightQuoteRow,
// chamado antes deste na mesma transação) -- separado do update genérico
// acima porque só orderSessionService.selectFreightQuote deve alterar
// frete, nunca um PATCH solto de sessão.
export async function setOrderSessionFreightRow(client: PoolClient, id: string, value: {
    quoteId: string | null; providerId: string | null; kind: FreightProviderKind;
    label: string; price: number; etaLabel: string | null;
    deliveryTypeId: string; deliveryOfferingId: string; deliveryProviderId: string;
    fulfillmentMode: DeliveryFulfillmentMode; deliveryTypeName: string; deliveryProviderName: string;
    destinationCep: string | null;
}): Promise<OrderSessionRow | null> {
    const result = await client.query<OrderSessionRow>(
        `UPDATE order_sessions SET
           freight_quote_id = $2, freight_provider_id = $3, freight_kind = $4,
           freight_label = $5, freight_price = $6, freight_eta_label = $7,
           delivery_type_id = $8, delivery_offering_id = $9, delivery_provider_id = $10,
           delivery_fulfillment_mode = $11, delivery_type_name = $12, delivery_provider_name = $13,
           delivery_destination_cep = $14,
           updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1
         RETURNING ${sessionFields}`,
        [id, value.quoteId, value.providerId, value.kind, value.label, value.price, value.etaLabel,
         value.deliveryTypeId, value.deliveryOfferingId, value.deliveryProviderId,
         value.fulfillmentMode, value.deliveryTypeName, value.deliveryProviderName, value.destinationCep],
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

// Cancelar um pedido (ver orderService.cancelOrder) cancela junto toda
// sessão irmã ainda aberta -- mesmo motivo de closeOpenOrderSessionRowsByOrder
// acima, só que com status 'cancelado' em vez de 'fechado' (mesmo padrão de
// cancelOpenOrderSessionRowsByBook, abaixo, só que por order_id).
export async function cancelOpenOrderSessionRowsByOrder(client: PoolClient, orderId: string): Promise<OrderSessionRow[]> {
    const result = await client.query<OrderSessionRow>(
        `UPDATE order_sessions SET status = 'cancelado', payment_token_hash = NULL,
           payment_token_created_at = NULL, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND order_id = $1
           AND status IN ('aberto', 'aguardando_pagamento')
         RETURNING ${sessionFields}`,
        [orderId],
    );
    return result.rows;
}

// Proteção para dados legados ou interrupções durante a finalização: uma
// sessão aberta não pode continuar apontando para um pedido já concluído.
// A consulta é limitada à cliente para poder ser usada quando ela retoma o
// carrinho, sem afetar atendimentos de outras pessoas.
export async function closeStaleOrderSessionRowsByClient(client: PoolClient, clientId: string): Promise<OrderSessionRow[]> {
    const result = await client.query<OrderSessionRow>(
        `UPDATE order_sessions AS session SET status = 'fechado', payment_token_hash = NULL,
           payment_token_created_at = NULL, updated_at = now()
         FROM orders AS "order"
         WHERE session.tenant_id = app_tenant_id() AND "order".tenant_id = app_tenant_id()
           AND session.client_id = $1 AND session.order_id = "order".id
           AND session.status IN ('aberto', 'aguardando_pagamento')
           AND "order".status IN ('pago', 'cancelado')
         RETURNING session.id, session.order_book_id, session.client_name, session.client_id,
           session.seller_id, session.channel, session.status, session.order_id,
           session.freight_quote_id, session.freight_provider_id, session.freight_kind,
           session.freight_label, session.freight_price, session.freight_eta_label,
           session.delivery_type_id, session.delivery_offering_id, session.delivery_provider_id,
           session.delivery_fulfillment_mode, session.delivery_type_name, session.delivery_provider_name,
           session.delivery_destination_cep,
           session.payment_token_created_at, session.notes, session.created_at, session.updated_at`,
        [clientId],
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
    total: number; paymentMethod?: string; discount?: Order["discount"];
    // Data original do pedido (ex. vinda do ERP) — sem valor, cai no now()
    // do banco (pedido criado agora mesmo, fluxo local de sempre).
    createdAt?: string;
}

const orderFields = "id, order_number, created_at, updated_at, client_id, seller_id, client_name, channel, status, total, payment_method, discount, payment_status, paid_at";

export async function insertOrderRow(client: PoolClient, value: OrderWriteRow): Promise<OrderRow> {
    const result = await client.query<OrderRow>(
        `WITH allocated_number AS (
           INSERT INTO tenant_order_counters (tenant_id, next_order_number)
           VALUES (app_tenant_id(), 2)
           ON CONFLICT (tenant_id) DO UPDATE
             SET next_order_number = tenant_order_counters.next_order_number + 1
           RETURNING next_order_number - 1 AS order_number
         )
         INSERT INTO orders (tenant_id, order_number, client_id, seller_id, client_name, channel, status, total, payment_method, discount, created_at)
         SELECT app_tenant_id(), allocated_number.order_number, $1,$2,$3,$4,$5,$6,$7,$8, COALESCE($9, now())
         FROM allocated_number
         RETURNING ${orderFields}`,
        [value.clientId ?? null, value.sellerId ?? null, value.clientName ?? null, value.channel,
         value.status ?? "pago", value.total,
         value.paymentMethod ?? null, value.discount ? JSON.stringify(value.discount) : null,
         value.createdAt ?? null],
    );
    return result.rows[0];
}

export async function findOrderRowById(client: PoolClient, id: string, lock = false): Promise<OrderRow | null> {
    const result = await client.query<OrderRow>(
        `SELECT ${orderFields} FROM orders
         WHERE tenant_id = app_tenant_id() AND id = $1${lock ? " FOR UPDATE" : ""}`, [id],
    );
    return result.rows[0] ?? null;
}

export async function findOrderRowByNumber(client: PoolClient, orderNumber: number): Promise<OrderRow | null> {
    const result = await client.query<OrderRow>(
        `SELECT ${orderFields} FROM orders
         WHERE tenant_id = app_tenant_id() AND order_number = $1`,
        [orderNumber],
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
    discount?: Order["discount"];
}): Promise<OrderRow | null> {
    const result = await client.query<OrderRow>(
        `UPDATE orders SET status = $2, total = COALESCE($3, total),
           payment_method = COALESCE($4, payment_method),
           discount = COALESCE($5::jsonb, discount), updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1
         RETURNING ${orderFields}`,
        [id, value.status, value.total ?? null, value.paymentMethod ?? null,
         value.discount ? JSON.stringify(value.discount) : null],
    );
    return result.rows[0] ?? null;
}

// Trilha financeira (payment_status/paid_at), separada do ciclo de
// separação física de `status` (ver comentário de OrderStatusSchema em
// contracts/orders.ts) -- usada por paymentChargeService.ts, tanto na
// confirmação síncrona de createOrderCharge quanto na aplicação de webhook/
// reconciliação. advanceToNovo só mexe em `status` quando o pedido ainda
// está 'aberto' (nunca regride um status mais avançado, ex. já 'separado').
export async function updateOrderPaymentStatusRow(client: PoolClient, id: string, value: {
    paymentStatus: NonNullable<Order["paymentStatus"]>; advanceToNovo?: boolean;
}): Promise<OrderRow | null> {
    const result = await client.query<OrderRow>(
        `UPDATE orders SET
           payment_status = $2,
           paid_at = CASE WHEN $2 = 'paid' THEN now() ELSE paid_at END,
           status = CASE WHEN $3 AND status = 'aberto' THEN 'novo' ELSE status END,
           updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1 AND payment_status != 'paid'
         RETURNING ${orderFields}`,
        [id, value.paymentStatus, Boolean(value.advanceToNovo)],
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
