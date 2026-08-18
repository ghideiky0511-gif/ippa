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
