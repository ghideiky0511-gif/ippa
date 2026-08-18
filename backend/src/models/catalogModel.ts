import type { PoolClient } from "pg";
import type { Availability, ClassificationKind } from "@/lib/types";

export interface ProductRow {
    id: string;
    name: string;
    description: string;
    category: string | null;
    subcategory: string | null;
    collection: string | null;
    brand: string | null;
    sku: string | null;
    price: string;
    suggested_retail_price: string | null;
    markup: string | null;
    media: { image?: string; images?: string[]; imagesByColor?: Record<string, string>; videoUrl?: string };
    attributes: Record<string, unknown>;
}

export type ProductOverrideRow = Partial<Pick<
    import("@/lib/types").Product,
    "sku" | "suggestedRetailPrice" | "markup" | "similarProductIdsQuickview" |
    "similarProductIdsCart" | "category" | "subcategory" | "collection"
>>;

export interface ProductVariantRow {
    product_id: string;
    id: string;
    color: string;
    size: string;
    price: string;
    availability: Availability;
    available_from: string | null;
    track_inventory: boolean;
}
export interface ProductPackRow {
    id: string; product_id: string; scope: import("@/lib/types").PackScope;
    label: string; color: string | null; price: string;
}
export interface ProductPackItemRow {
    pack_id: string; size: string; color: string | null; quantity: number;
}

export interface InventoryBalanceRow { variant_id: string; stock_qty: number }
export interface ProductClassificationRow { product_id: string; kind: ClassificationKind; name: string }

export async function listProductRows(client: PoolClient): Promise<ProductRow[]> {
    const result = await client.query<ProductRow>(
        `SELECT id, name, description, category, subcategory, collection, brand, sku, price, suggested_retail_price, markup, media, attributes
         FROM products WHERE tenant_id = app_tenant_id()
         ORDER BY display_position NULLS LAST, created_at`,
    );
    return result.rows;
}

export async function listProductVariantRows(client: PoolClient): Promise<ProductVariantRow[]> {
    const result = await client.query<ProductVariantRow>(
        `SELECT product_id, id, color, size, price, availability, available_from, track_inventory
         FROM product_variants WHERE tenant_id = app_tenant_id() ORDER BY color, size`,
    );
    return result.rows;
}

export async function listProductPackRows(client: PoolClient): Promise<ProductPackRow[]> {
    const result = await client.query<ProductPackRow>(
        `SELECT id, product_id, scope, label, color, price FROM product_packs
         WHERE tenant_id = app_tenant_id() ORDER BY label`,
    );
    return result.rows;
}

export async function listProductPackItemRows(client: PoolClient): Promise<ProductPackItemRow[]> {
    const result = await client.query<ProductPackItemRow>(
        `SELECT pack_id, size, color, quantity FROM product_pack_items
         WHERE tenant_id = app_tenant_id() ORDER BY id`,
    );
    return result.rows;
}

export async function listInventoryBalanceRows(client: PoolClient): Promise<InventoryBalanceRow[]> {
    const result = await client.query<InventoryBalanceRow>(
        `SELECT balance.variant_id, SUM(balance.available_qty)::integer AS stock_qty
         FROM inventory_balances balance
         JOIN inventory_locations location ON location.id = balance.location_id
         WHERE balance.tenant_id = app_tenant_id() AND location.active
         GROUP BY balance.variant_id`,
    );
    return result.rows;
}

export async function listPrimaryClassificationRows(client: PoolClient): Promise<ProductClassificationRow[]> {
    const result = await client.query<ProductClassificationRow>(
        `SELECT link.product_id, type.kind, classification.name
         FROM product_classifications link
         JOIN classifications classification ON classification.id = link.classification_id
         JOIN classification_types type ON type.id = link.classification_type_id
         WHERE link.tenant_id = app_tenant_id() AND link.is_primary`,
    );
    return result.rows;
}

export interface ProductWriteRow {
    name: string; description?: string; category: string; subcategory?: string;
    collection?: string; brand?: string; sku?: string; price: number;
    suggestedRetailPrice?: number; markup?: number;
    media?: ProductRow["media"]; attributes?: Record<string, unknown>;
}

const productFields =
    "id, name, description, category, subcategory, collection, brand, sku, price, suggested_retail_price, markup, media, attributes";

export async function insertProductRow(client: PoolClient, value: ProductWriteRow): Promise<ProductRow> {
    const result = await client.query<ProductRow>(
        `INSERT INTO products (tenant_id, name, description, category, subcategory, collection, brand, sku, price, suggested_retail_price, markup, media, attributes)
         VALUES (app_tenant_id(), $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING ${productFields}`,
        [value.name, value.description ?? "", value.category, value.subcategory ?? null,
         value.collection ?? null, value.brand ?? null, value.sku ?? null, value.price,
         value.suggestedRetailPrice ?? null, value.markup ?? null,
         JSON.stringify(value.media ?? {}), JSON.stringify(value.attributes ?? {})],
    );
    return result.rows[0];
}

// COALESCE em vez de sobrescrever com null: um payload de sync do ERP pode
// trazer só um subconjunto de campos, e não deve apagar o que já existia.
export async function updateProductRow(client: PoolClient, id: string, value: Partial<ProductWriteRow>): Promise<ProductRow | null> {
    const result = await client.query<ProductRow>(
        `UPDATE products SET name = COALESCE($2, name), description = COALESCE($3, description), category = COALESCE($4, category),
           subcategory = COALESCE($5, subcategory), collection = COALESCE($6, collection), brand = COALESCE($7, brand),
           sku = COALESCE($8, sku), price = COALESCE($9, price), suggested_retail_price = COALESCE($10, suggested_retail_price),
           markup = COALESCE($11, markup), media = COALESCE($12, media), attributes = COALESCE($13, attributes),
           updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1 RETURNING ${productFields}`,
        [id, value.name ?? null, value.description ?? null, value.category ?? null,
         value.subcategory ?? null, value.collection ?? null, value.brand ?? null, value.sku ?? null,
         value.price ?? null, value.suggestedRetailPrice ?? null, value.markup ?? null,
         value.media ? JSON.stringify(value.media) : null, value.attributes ? JSON.stringify(value.attributes) : null],
    );
    return result.rows[0] ?? null;
}

export async function listCatalogOrderRows(client: PoolClient): Promise<string[]> {
    const result = await client.query<{ id: string }>(
        `SELECT id FROM products WHERE tenant_id = app_tenant_id() AND display_position IS NOT NULL
         ORDER BY display_position, created_at`,
    );
    return result.rows.map((row) => row.id);
}

export async function replaceCatalogOrderRows(client: PoolClient, productIds: string[]): Promise<void> {
    await client.query(
        "UPDATE products SET display_position = NULL WHERE tenant_id = app_tenant_id()",
    );
    for (const [position, id] of productIds.entries()) {
        await client.query(
            `UPDATE products SET display_position = $2, updated_at = now()
             WHERE tenant_id = app_tenant_id() AND id = $1`,
            [id, position],
        );
    }
}

export async function listProductOverrideRows(client: PoolClient): Promise<Array<{ id: string; override: ProductOverrideRow }>> {
    const result = await client.query<{ id: string; override: ProductOverrideRow }>(
        `SELECT id, attributes->'manualOverride' AS override FROM products
         WHERE tenant_id = app_tenant_id() AND attributes ? 'manualOverride' ORDER BY created_at`,
    );
    return result.rows;
}

export async function clearProductOverrideRows(client: PoolClient): Promise<void> {
    await client.query(
        `UPDATE products SET attributes = attributes - 'manualOverride', updated_at = now()
         WHERE tenant_id = app_tenant_id() AND attributes ? 'manualOverride'`,
    );
}

export async function setProductOverrideRow(client: PoolClient, productId: string, value: ProductOverrideRow): Promise<void> {
    await client.query(
        `UPDATE products SET attributes = jsonb_set(attributes, '{manualOverride}', $2::jsonb, true), updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1`,
        [productId, JSON.stringify(value)],
    );
}
