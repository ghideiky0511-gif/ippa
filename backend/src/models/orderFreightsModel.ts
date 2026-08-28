import type { PoolClient } from "pg";
import type { DeliveryFulfillmentMode, FreightProviderKind, OrderFreightMethod, OrderFreightStatus } from "@/lib/types";

export interface OrderFreightRow {
    id: string; order_id: string; provider_id: string | null; quote_id: string | null;
    kind: FreightProviderKind; method: OrderFreightMethod | null; label: string; price: string; eta_label: string | null;
    tracking_code: string | null; tracking_url: string | null; status: OrderFreightStatus;
    shipped_at: Date | null; delivered_at: Date | null; cancelled_at: Date | null;
    delivery_type_id: string | null; delivery_offering_id: string | null; delivery_provider_id: string | null;
    delivery_fulfillment_mode: DeliveryFulfillmentMode | null;
    delivery_type_name: string | null; delivery_provider_name: string | null;
    destination_cep: string | null;
}

const orderFreightFields = "id, order_id, provider_id, quote_id, kind, method, label, price, eta_label, tracking_code, tracking_url, status, shipped_at, delivered_at, cancelled_at, delivery_type_id, delivery_offering_id, delivery_provider_id, delivery_fulfillment_mode, delivery_type_name, delivery_provider_name, destination_cep";

export interface OrderFreightWriteRow {
    orderId: string; providerId: string | null; quoteId: string | null;
    kind: FreightProviderKind; label: string; price: number; etaLabel: string | null;
    deliveryTypeId: string | null; deliveryOfferingId: string | null; deliveryProviderId: string | null;
    fulfillmentMode: DeliveryFulfillmentMode | null; deliveryTypeName: string | null; deliveryProviderName: string | null;
    destinationCep: string | null;
}

export async function insertOrderFreightRow(client: PoolClient, value: OrderFreightWriteRow): Promise<OrderFreightRow> {
    const result = await client.query<OrderFreightRow>(
        `INSERT INTO order_freights (
           tenant_id, order_id, provider_id, quote_id, kind, label, price, eta_label,
           delivery_type_id, delivery_offering_id, delivery_provider_id,
           delivery_fulfillment_mode, delivery_type_name, delivery_provider_name
           , destination_cep
         )
         VALUES (app_tenant_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING ${orderFreightFields}`,
        [value.orderId, value.providerId, value.quoteId, value.kind, value.label, value.price, value.etaLabel,
         value.deliveryTypeId, value.deliveryOfferingId, value.deliveryProviderId,
         value.fulfillmentMode, value.deliveryTypeName, value.deliveryProviderName, value.destinationCep],
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

/** Troca o tipo de frete de um pedido já fechado -- ver
 * updateOrderFreightMethod em orderService.ts pras regras de quando isso é
 * permitido (frete ainda não despachado, pedido não cancelado). */
export async function updateOrderFreightMethodRow(
    client: PoolClient,
    orderId: string,
    method: OrderFreightMethod,
): Promise<OrderFreightRow | null> {
    const result = await client.query<OrderFreightRow>(
        `UPDATE order_freights SET method = $1 WHERE tenant_id = app_tenant_id() AND order_id = $2
         RETURNING ${orderFreightFields}`,
        [method, orderId],
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
