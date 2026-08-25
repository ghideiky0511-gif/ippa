import type { PoolClient } from "pg";
import type { Availability, ClassificationKind } from "@/lib/types";
import type { ProductOverride } from "@/contracts/catalog";

export interface ProductRow {
    id: string;
    name: string;
    description: string;
    category: string | null;
    subcategory: string | null;
    collection: string | null;
    brand: string | null;
    reference_id: string | null;
    price: string;
    suggested_retail_price: string | null;
    markup: string | null;
    media: { image?: string; images?: string[]; imagesByColor?: Record<string, string>; videoUrl?: string };
    attributes: Record<string, unknown>;
}

export type ProductOverrideRow = ProductOverride;

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

export interface ClassificationRow {
    id: string;
    classification_type_id: string;
    kind: ClassificationKind;
    parent_id: string | null;
    name: string;
    active: boolean;
    position: number;
}

export async function listProductRows(client: PoolClient): Promise<ProductRow[]> {
    const result = await client.query<ProductRow>(
        `SELECT id, name, description, category, subcategory, collection, brand, reference_id, price, suggested_retail_price, markup, media, attributes
         FROM products WHERE tenant_id = app_tenant_id()
         ORDER BY display_position NULLS LAST, created_at`,
    );
    return result.rows;
}

// Só os pares (id, reference_id) de um lote pontual de produtos -- usada
// pelo envio de pedido ao ERP (ver services/erp/orderPushService), que
// precisa do código bruto do ERP por item do pedido sem carregar o
// catálogo inteiro (listProductRows) só para isso.
export async function findProductReferenceIdsByIds(client: PoolClient, productIds: string[]): Promise<Record<string, string>> {
    if (productIds.length === 0) return {};
    const result = await client.query<{ id: string; reference_id: string | null }>(
        `SELECT id, reference_id FROM products WHERE tenant_id = app_tenant_id() AND id = ANY($1::uuid[])`,
        [productIds],
    );
    const map: Record<string, string> = {};
    for (const row of result.rows) if (row.reference_id) map[row.id] = row.reference_id;
    return map;
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

// Só o que deve aparecer no menu público — respeita o opt-in do tenant
// (`classification.active`/`type.active`, ambos default true no schema).
export async function listCategoryMenuRows(client: PoolClient): Promise<ClassificationRow[]> {
    const result = await client.query<ClassificationRow>(
        `SELECT classification.id, classification.classification_type_id, type.kind,
                classification.parent_id, classification.name, classification.active, classification.position
         FROM classifications classification
         JOIN classification_types type ON type.id = classification.classification_type_id
         WHERE classification.tenant_id = app_tenant_id() AND type.kind IN ('category', 'subcategory')
           AND classification.active AND type.active
         ORDER BY classification.position, classification.name`,
    );
    return result.rows;
}

// Todas as classificações de categoria/subcategoria, ligadas ou não — pra
// tela de admin listar e deixar o tenant optar quais mostrar.
export async function listClassificationRows(client: PoolClient): Promise<ClassificationRow[]> {
    const result = await client.query<ClassificationRow>(
        `SELECT classification.id, classification.classification_type_id, type.kind,
                classification.parent_id, classification.name, classification.active, classification.position
         FROM classifications classification
         JOIN classification_types type ON type.id = classification.classification_type_id
         WHERE classification.tenant_id = app_tenant_id() AND type.kind IN ('category', 'subcategory')
         ORDER BY type.kind, classification.position, classification.name`,
    );
    return result.rows;
}

export async function setClassificationActiveRow(client: PoolClient, id: string, active: boolean): Promise<ClassificationRow | null> {
    const result = await client.query<ClassificationRow>(
        `WITH updated AS (
           UPDATE classifications SET active = $2, updated_at = now()
           WHERE tenant_id = app_tenant_id() AND id = $1
           RETURNING id, classification_type_id, parent_id, name, active, position
         )
         SELECT updated.id, updated.classification_type_id, type.kind, updated.parent_id, updated.name, updated.active, updated.position
         FROM updated JOIN classification_types type ON type.id = updated.classification_type_id`,
        [id, active],
    );
    return result.rows[0] ?? null;
}

export interface ProductWriteRow {
    name: string; description?: string; category: string; subcategory?: string;
    collection?: string; brand?: string; referenceId?: string; price: number;
    suggestedRetailPrice?: number; markup?: number;
    media?: ProductRow["media"]; attributes?: Record<string, unknown>;
}

export interface ProductVariantWriteRow {
    color: string;
    size: string;
    price: number;
    availability?: Availability;
}

const productFields =
    "id, name, description, category, subcategory, collection, brand, reference_id, price, suggested_retail_price, markup, media, attributes";

export async function insertProductRow(client: PoolClient, value: ProductWriteRow): Promise<ProductRow> {
    const result = await client.query<ProductRow>(
        `INSERT INTO products (tenant_id, name, description, category, subcategory, collection, brand, reference_id, price, suggested_retail_price, markup, media, attributes)
         VALUES (app_tenant_id(), $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING ${productFields}`,
        [value.name, value.description ?? "", value.category, value.subcategory ?? null,
         value.collection ?? null, value.brand ?? null, value.referenceId ?? null, value.price,
         value.suggestedRetailPrice ?? null, value.markup ?? null,
         JSON.stringify(value.media ?? {}), JSON.stringify(value.attributes ?? {})],
    );
    return result.rows[0];
}

/** A variante é criada junto do produto manual para que o catálogo já possa ser pedido. */
export async function insertProductVariantRow(
    client: PoolClient,
    productId: string,
    value: ProductVariantWriteRow,
): Promise<void> {
    await client.query(
        `INSERT INTO product_variants (tenant_id, product_id, color, size, price, availability)
         VALUES (app_tenant_id(), $1, $2, $3, $4, $5)`,
        [productId, value.color, value.size, value.price, value.availability ?? "in_stock"],
    );
}

export async function productReferenceIdExists(client: PoolClient, referenceId: string): Promise<boolean> {
    const result = await client.query(
        "SELECT 1 FROM products WHERE tenant_id = app_tenant_id() AND reference_id = $1 LIMIT 1",
        [referenceId],
    );
    return (result.rowCount ?? 0) > 0;
}

// Upsert usado pelo import de catálogo externo da Vesti
// (services/platform/vestiCatalogService.ts). Reconcilia pela mesma
// UNIQUE (tenant_id, reference_id) que o sync de ERP já preenche em
// insertProductRow/updateProductRow — reference_id é o código bruto do
// provider externo, qualquer que ele seja.
export async function upsertProductByReferenceIdRow(
    client: PoolClient,
    value: ProductWriteRow & { referenceId: string },
): Promise<{ row: ProductRow; created: boolean }> {
    const result = await client.query<ProductRow & { inserted: boolean }>(
        `INSERT INTO products (tenant_id, name, description, category, subcategory, collection, brand, reference_id, price, suggested_retail_price, markup, media, attributes)
         VALUES (app_tenant_id(), $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (tenant_id, reference_id) DO UPDATE SET
           name = EXCLUDED.name, description = EXCLUDED.description, category = EXCLUDED.category,
           subcategory = EXCLUDED.subcategory, collection = EXCLUDED.collection, brand = EXCLUDED.brand,
           price = EXCLUDED.price, suggested_retail_price = EXCLUDED.suggested_retail_price, markup = EXCLUDED.markup,
           media = EXCLUDED.media, attributes = EXCLUDED.attributes, updated_at = now()
         RETURNING ${productFields}, (xmax = 0) AS inserted`,
        [value.name, value.description ?? "", value.category, value.subcategory ?? null,
         value.collection ?? null, value.brand ?? null, value.referenceId, value.price,
         value.suggestedRetailPrice ?? null, value.markup ?? null,
         JSON.stringify(value.media ?? {}), JSON.stringify(value.attributes ?? {})],
    );
    const { inserted, ...row } = result.rows[0];
    return { row, created: inserted };
}

// Upsert usado pelo mesmo import — chave natural já existente no schema
// (UNIQUE (tenant_id, product_id, color, size), migration 002), sem
// precisar de reconciliação por external-id como o ERP.
export async function upsertProductVariantRow(
    client: PoolClient,
    productId: string,
    value: ProductVariantWriteRow,
): Promise<{ id: string; created: boolean }> {
    const result = await client.query<{ id: string; inserted: boolean }>(
        `INSERT INTO product_variants (tenant_id, product_id, color, size, price, availability)
         VALUES (app_tenant_id(), $1, $2, $3, $4, $5)
         ON CONFLICT (tenant_id, product_id, color, size)
         DO UPDATE SET price = EXCLUDED.price, availability = EXCLUDED.availability
         RETURNING id, (xmax = 0) AS inserted`,
        [productId, value.color, value.size, value.price, value.availability ?? "in_stock"],
    );
    return { id: result.rows[0].id, created: result.rows[0].inserted };
}

/** Mantém a classificação canônica em sincronia com a coluna legada do produto. */
export async function setPrimaryProductCategoryRow(
    client: PoolClient,
    productId: string,
    name: string,
    slug: string,
): Promise<void> {
    await client.query(
        `WITH category_type AS (
           SELECT id FROM classification_types
           WHERE tenant_id = app_tenant_id() AND kind = 'category'
         ), category AS (
           INSERT INTO classifications (tenant_id, classification_type_id, name, slug)
           SELECT app_tenant_id(), id, $2, $3 FROM category_type
           ON CONFLICT (tenant_id, classification_type_id, parent_id, slug)
           DO UPDATE SET name = EXCLUDED.name, updated_at = now()
           RETURNING id, classification_type_id
         )
         INSERT INTO product_classifications (tenant_id, product_id, classification_id, classification_type_id, is_primary)
         SELECT app_tenant_id(), $1, id, classification_type_id, true FROM category
         ON CONFLICT (tenant_id, product_id, classification_id)
         DO UPDATE SET is_primary = true`,
        [productId, name, slug],
    );
}

// COALESCE em vez de sobrescrever com null: um payload de sync do ERP pode
// trazer só um subconjunto de campos, e não deve apagar o que já existia.
export async function updateProductRow(client: PoolClient, id: string, value: Partial<ProductWriteRow>): Promise<ProductRow | null> {
    const result = await client.query<ProductRow>(
        `UPDATE products SET name = COALESCE($2, name), description = COALESCE($3, description), category = COALESCE($4, category),
           subcategory = COALESCE($5, subcategory), collection = COALESCE($6, collection), brand = COALESCE($7, brand),
           reference_id = COALESCE($8, reference_id), price = COALESCE($9, price), suggested_retail_price = COALESCE($10, suggested_retail_price),
           markup = COALESCE($11, markup), media = COALESCE($12, media), attributes = COALESCE($13, attributes),
           updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1 RETURNING ${productFields}`,
        [id, value.name ?? null, value.description ?? null, value.category ?? null,
         value.subcategory ?? null, value.collection ?? null, value.brand ?? null, value.referenceId ?? null,
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
