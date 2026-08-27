import type { PoolClient } from "pg";
import type { FreightProviderKind, OrderFreightStatus } from "@/lib/types";

export interface OrderFreightRow {
    id: string; order_id: string; provider_id: string | null; quote_id: string | null;
    kind: FreightProviderKind; label: string; price: string; eta_label: string | null;
    tracking_code: string | null; tracking_url: string | null; status: OrderFreightStatus;
    shipped_at: Date | null; delivered_at: Date | null; cancelled_at: Date | null;
}

const orderFreightFields = "id, order_id, provider_id, quote_id, kind, label, price, eta_label, tracking_code, tracking_url, status, shipped_at, delivered_at, cancelled_at";

export interface OrderFreightWriteRow {
    orderId: string; providerId: string | null; quoteId: string | null;
    kind: FreightProviderKind; label: string; price: number; etaLabel: string | null;
}

export async function insertOrderFreightRow(client: PoolClient, value: OrderFreightWriteRow): Promise<OrderFreightRow> {
    const result = await client.query<OrderFreightRow>(
        `INSERT INTO order_freights (tenant_id, order_id, provider_id, quote_id, kind, label, price, eta_label)
         VALUES (app_tenant_id(), $1, $2, $3, $4, $5, $6, $7)
         RETURNING ${orderFreightFields}`,
        [value.orderId, value.providerId, value.quoteId, value.kind, value.label, value.price, value.etaLabel],
    );
    return result.rows[0];
}

export async function findOrderFreightRowByOrderId(client: PoolClient, orderId: string): Promise<OrderFreightRow | null> {
    const result = await client.query<OrderFreightRow>(
        `SELECT ${orderFreightFields} FROM order_freights WHERE tenant_id = app_tenant_id() AND order_id = $1`,
        [orderId],
    );
    return result.rows[0] ?? null;
}

/** Todas as linhas do tenant, pra join em memória com uma lista de pedidos
 * já carregada -- mesmo padrão de listOrderItemRows em ordersModel.ts. */
export async function listOrderFreightRows(client: PoolClient): Promise<OrderFreightRow[]> {
    const result = await client.query<OrderFreightRow>(
        `SELECT ${orderFreightFields} FROM order_freights WHERE tenant_id = app_tenant_id()`,
    );
    return result.rows;
}
