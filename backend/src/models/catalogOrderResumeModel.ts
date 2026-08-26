import type { PoolClient } from 'pg';

export interface CatalogLastPaidOrderRow {
  id: string;
  created_at: Date;
  total: string;
}

export interface CatalogOrderResumeItemRow {
  item_key: string;
  product_id: string | null;
  qty: number;
  unit_price: string | null;
  color: string | null;
  size: string | null;
  category: string | null;
  subcategory: string | null;
}

export interface CatalogOrderTicketStatisticsRow {
  client_average: string | null;
  client_order_count: string;
  tenant_average: string | null;
  tenant_order_count: string;
}

export async function findLatestPaidOrderForClientRow(
  client: PoolClient,
  clientId: string,
): Promise<CatalogLastPaidOrderRow | null> {
  const result = await client.query<CatalogLastPaidOrderRow>(
    `SELECT id, created_at, total::text
     FROM orders
     WHERE tenant_id = app_tenant_id() AND client_id = $1 AND status = 'pago'
     ORDER BY created_at DESC
     LIMIT 1`,
    [clientId],
  );
  return result.rows[0] ?? null;
}

export async function listCatalogOrderResumeItemRows(
  client: PoolClient,
  orderId: string,
): Promise<CatalogOrderResumeItemRow[]> {
  const result = await client.query<CatalogOrderResumeItemRow>(
    `SELECT item.item_key, item.product_id, item.qty, item.unit_price::text,
       COALESCE(variant.color, item.snapshot->>'color') AS color,
       COALESCE(variant.size, item.snapshot->>'size') AS size,
       COALESCE(
         max(classification.name) FILTER (WHERE type.kind = 'category' AND link.is_primary),
         product.category,
         item.snapshot->>'category'
       ) AS category,
       COALESCE(
         max(classification.name) FILTER (WHERE type.kind = 'subcategory' AND link.is_primary),
         product.subcategory,
         item.snapshot->>'subcategory'
       ) AS subcategory
     FROM order_items AS item
     LEFT JOIN products AS product
       ON product.tenant_id = app_tenant_id() AND product.id = item.product_id
     LEFT JOIN product_variants AS variant
       ON variant.tenant_id = app_tenant_id() AND variant.id = item.variant_id
     LEFT JOIN product_classifications AS link
       ON link.tenant_id = app_tenant_id() AND link.product_id = item.product_id
     LEFT JOIN classification_types AS type
       ON type.tenant_id = app_tenant_id() AND type.id = link.classification_type_id
     LEFT JOIN classifications AS classification
       ON classification.tenant_id = app_tenant_id() AND classification.id = link.classification_id
     WHERE item.tenant_id = app_tenant_id() AND item.order_id = $1
     GROUP BY item.id, variant.color, variant.size, product.category, product.subcategory
     ORDER BY item.id`,
    [orderId],
  );
  return result.rows;
}

export async function findPaidOrderTicketStatisticsRow(
  client: PoolClient,
  clientId: string,
  periodStart: Date,
): Promise<CatalogOrderTicketStatisticsRow> {
  const result = await client.query<CatalogOrderTicketStatisticsRow>(
    `SELECT
       avg(total) FILTER (WHERE client_id = $1)::text AS client_average,
       count(*) FILTER (WHERE client_id = $1)::text AS client_order_count,
       avg(total)::text AS tenant_average,
       count(*)::text AS tenant_order_count
     FROM orders
     WHERE tenant_id = app_tenant_id() AND status = 'pago' AND created_at >= $2`,
    [clientId, periodStart],
  );
  return result.rows[0] ?? {
    client_average: null,
    client_order_count: '0',
    tenant_average: null,
    tenant_order_count: '0',
  };
}
