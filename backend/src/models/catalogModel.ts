import type { PoolClient } from "pg";
import type { Availability } from "@/lib/types";
import type { ProductOverride } from "@/contracts/catalog";
import { replaceManualVariantClassificationIdsRow } from "@/models/classificationModel";

export interface ProductRow {
    id: string;
    name: string;
    description: string;
    reference_id: string | null;
    price: string;
    suggested_retail_price: string | null;
    markup: string | null;
    media: {
        image?: string; images?: string[]; imagesByColor?: Record<string, string>; videoUrl?: string;
        imageKey?: string; imageKeys?: string[]; imageKeysByColor?: Record<string, string>; videoKeys?: string[];
    };
    attributes: Record<string, unknown>;
    is_active: boolean;
    source_origin: "manual" | "bootstrap" | "erp";
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
    sku: string | null;
    bootstrap_external_code: string | null;
    is_active: boolean;
    source_origin: "manual" | "bootstrap" | "erp";
}
export interface ProductPackRow {
    id: string; product_id: string; scope: import("@/lib/types").PackScope;
    label: string; color: string | null; price: string;
}
export interface ProductPackItemRow {
    pack_id: string; size: string; color: string | null; quantity: number;
}

export interface InventoryBalanceRow { variant_id: string; stock_qty: number }
export async function listProductRows(client: PoolClient): Promise<ProductRow[]> {
    const result = await client.query<ProductRow>(
        `SELECT id, name, description, reference_id, price, suggested_retail_price, markup, media, attributes, is_active, source_origin
         FROM products WHERE tenant_id = app_tenant_id() AND is_active
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
        `SELECT product_id, id, color, size, price, availability, available_from,
                track_inventory, sku, bootstrap_external_code, is_active, source_origin
         FROM product_variants
         WHERE tenant_id = app_tenant_id() AND is_active
         ORDER BY color, size`,
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

export interface ProductWriteRow {
    name: string; description?: string; referenceId?: string; price: number;
    suggestedRetailPrice?: number; markup?: number;
    media?: ProductRow["media"]; attributes?: Record<string, unknown>;
    isActive?: boolean;
    sourceOrigin?: ProductRow["source_origin"];
}

export interface ProductVariantWriteRow {
    color: string;
    size: string;
    price: number;
    availability?: Availability;
    sku?: string;
    bootstrapExternalCode?: string;
    trackInventory?: boolean;
    isActive?: boolean;
    sourceOrigin?: ProductVariantRow["source_origin"];
}

const productFields =
    "id, name, description, reference_id, price, suggested_retail_price, markup, media, attributes, is_active, source_origin";

export async function insertProductRow(client: PoolClient, value: ProductWriteRow): Promise<ProductRow> {
    const result = await client.query<ProductRow>(
        `INSERT INTO products (tenant_id, name, description, reference_id, price, suggested_retail_price, markup, media, attributes, is_active, source_origin)
         VALUES (app_tenant_id(), $1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING ${productFields}`,
        [value.name, value.description ?? "", value.referenceId ?? null, value.price,
         value.suggestedRetailPrice ?? null, value.markup ?? null,
         JSON.stringify(value.media ?? {}), JSON.stringify(value.attributes ?? {}),
         value.isActive ?? true, value.sourceOrigin ?? "manual"],
    );
    return result.rows[0];
}

/** A variante é criada junto do produto manual para que o catálogo já possa ser pedido. */
export async function insertProductVariantRow(
    client: PoolClient,
    productId: string,
    value: ProductVariantWriteRow,
): Promise<string> {
    const result = await client.query<{ id: string }>(
        `INSERT INTO product_variants (tenant_id, product_id, color, size, price, availability, sku, track_inventory, is_active, source_origin)
         VALUES (app_tenant_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [productId, value.color, value.size, value.price, value.availability ?? "in_stock",
         value.sku ?? null, value.trackInventory ?? false, value.isActive ?? true, value.sourceOrigin ?? "manual"],
    );
    return result.rows[0].id;
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
        `INSERT INTO products (tenant_id, name, description, reference_id, price, suggested_retail_price, markup, media, attributes, is_active, source_origin)
         VALUES (app_tenant_id(), $1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (tenant_id, reference_id) DO UPDATE SET
           name = EXCLUDED.name, description = EXCLUDED.description,
           price = EXCLUDED.price, suggested_retail_price = EXCLUDED.suggested_retail_price, markup = EXCLUDED.markup,
            media = CASE WHEN EXCLUDED.media = '{}'::jsonb THEN products.media ELSE EXCLUDED.media END,
            attributes = products.attributes || EXCLUDED.attributes,
            is_active = EXCLUDED.is_active, source_origin = EXCLUDED.source_origin,
            updated_at = now()
         RETURNING ${productFields}, (xmax = 0) AS inserted`,
        [value.name, value.description ?? "", value.referenceId, value.price,
         value.suggestedRetailPrice ?? null, value.markup ?? null,
         JSON.stringify(value.media ?? {}), JSON.stringify(value.attributes ?? {}),
         value.isActive ?? true, value.sourceOrigin ?? "bootstrap"],
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
        `INSERT INTO product_variants (tenant_id, product_id, color, size, price, availability, sku, bootstrap_external_code, track_inventory, is_active, source_origin)
         VALUES (app_tenant_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (tenant_id, product_id, color, size)
         DO UPDATE SET price = EXCLUDED.price, availability = EXCLUDED.availability,
           sku = COALESCE(EXCLUDED.sku, product_variants.sku),
           bootstrap_external_code = COALESCE(EXCLUDED.bootstrap_external_code, product_variants.bootstrap_external_code),
           track_inventory = EXCLUDED.track_inventory,
           is_active = EXCLUDED.is_active, source_origin = EXCLUDED.source_origin
         RETURNING id, (xmax = 0) AS inserted`,
        [productId, value.color, value.size, value.price, value.availability ?? "in_stock",
         value.sku ?? null, value.bootstrapExternalCode ?? null, value.trackInventory ?? false,
         value.isActive ?? true, value.sourceOrigin ?? "bootstrap"],
    );
    return { id: result.rows[0].id, created: result.rows[0].inserted };
}

export async function findProductByReferenceIdRow(
    client: PoolClient,
    referenceId: string,
): Promise<ProductRow | null> {
    const result = await client.query<ProductRow>(
        `SELECT ${productFields} FROM products
         WHERE tenant_id = app_tenant_id() AND reference_id = $1`,
        [referenceId],
    );
    return result.rows[0] ?? null;
}

/** Troca a referência de bootstrap pela referência canônica resolvida no ERP. */
export async function replaceProductReferenceIdRow(
    client: PoolClient,
    productId: string,
    referenceId: string,
): Promise<boolean> {
    const result = await client.query(
        `UPDATE products
         SET reference_id = $2, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1`,
        [productId, referenceId],
    );
    return (result.rowCount ?? 0) > 0;
}

export async function findProductByIdRow(
    client: PoolClient,
    id: string,
): Promise<ProductRow | null> {
    const result = await client.query<ProductRow>(
        `SELECT ${productFields} FROM products
         WHERE tenant_id = app_tenant_id() AND id = $1`,
        [id],
    );
    return result.rows[0] ?? null;
}

/** Upsert do ERP preserva mídia e atributos locais; só o bootstrap escreve mídia. */
export async function upsertErpProductRow(
    client: PoolClient,
    value: ProductWriteRow & { referenceId: string },
): Promise<{ row: ProductRow; created: boolean }> {
    const result = await client.query<ProductRow & { inserted: boolean }>(
        `INSERT INTO products (
           tenant_id, name, description, reference_id, price, is_active, source_origin
         ) VALUES (app_tenant_id(), $1,$2,$3,$4,$5,'erp')
         ON CONFLICT (tenant_id, reference_id) DO UPDATE SET
           name = EXCLUDED.name, description = EXCLUDED.description,
           price = EXCLUDED.price, is_active = EXCLUDED.is_active,
           source_origin = 'erp', updated_at = now()
         RETURNING ${productFields}, (xmax = 0) AS inserted`,
        [value.name, value.description ?? "", value.referenceId, value.price, value.isActive ?? false],
    );
    const { inserted, ...row } = result.rows[0];
    return { row, created: inserted };
}

export async function listProductVariantsForSyncRow(
    client: PoolClient,
    productId: string,
): Promise<ProductVariantRow[]> {
    const result = await client.query<ProductVariantRow>(
        `SELECT product_id, id, color, size, price, availability, available_from,
                track_inventory, sku, bootstrap_external_code, is_active, source_origin
         FROM product_variants
         WHERE tenant_id = app_tenant_id() AND product_id = $1`,
        [productId],
    );
    return result.rows;
}

export async function upsertErpProductVariantRow(
    client: PoolClient,
    input: { id?: string; productId: string; value: ProductVariantWriteRow },
): Promise<{ id: string; created: boolean }> {
    if (input.id) {
        const result = await client.query<{ id: string }>(
            `UPDATE product_variants SET
               color = $3, size = $4, price = $5, availability = $6,
               sku = COALESCE($7, sku), track_inventory = true,
               is_active = $8, source_origin = 'erp'
             WHERE tenant_id = app_tenant_id() AND id = $1 AND product_id = $2
             RETURNING id`,
            [input.id, input.productId, input.value.color, input.value.size,
             input.value.price, input.value.availability ?? "out_of_stock",
             input.value.sku ?? null, input.value.isActive ?? false],
        );
        if (result.rows[0]) return { id: result.rows[0].id, created: false };
    }
    const result = await client.query<{ id: string }>(
        `INSERT INTO product_variants (
           tenant_id, product_id, color, size, price, availability, sku,
           track_inventory, is_active, source_origin
         ) VALUES (app_tenant_id(), $1,$2,$3,$4,$5,$6,true,$7,'erp')
         RETURNING id`,
        [input.productId, input.value.color, input.value.size, input.value.price,
         input.value.availability ?? "out_of_stock", input.value.sku ?? null,
         input.value.isActive ?? false],
    );
    return { id: result.rows[0].id, created: true };
}

export async function deactivateMissingProductVariantsRow(
    client: PoolClient,
    productId: string,
    activeVariantIds: string[],
): Promise<void> {
    await client.query(
        `UPDATE product_variants SET is_active = false, availability = 'out_of_stock', source_origin = 'erp'
         WHERE tenant_id = app_tenant_id() AND product_id = $1
           AND NOT (id = ANY($2::uuid[]))`,
        [productId, activeVariantIds],
    );
}

export async function setProductSyncActiveRow(
    client: PoolClient,
    productId: string,
    active: boolean,
): Promise<void> {
    await client.query(
        `UPDATE products SET is_active = $2, source_origin = 'erp', updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1`,
        [productId, active],
    );
}

// COALESCE em vez de sobrescrever com null: um payload de sync do ERP pode
// trazer só um subconjunto de campos, e não deve apagar o que já existia.
export async function updateProductRow(client: PoolClient, id: string, value: Partial<ProductWriteRow>): Promise<ProductRow | null> {
    const result = await client.query<ProductRow>(
        `UPDATE products SET name = COALESCE($2, name), description = COALESCE($3, description),
           reference_id = COALESCE($4, reference_id), price = COALESCE($5, price), suggested_retail_price = COALESCE($6, suggested_retail_price),
           markup = COALESCE($7, markup), media = COALESCE($8, media), attributes = COALESCE($9, attributes),
           updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1 RETURNING ${productFields}`,
        [id, value.name ?? null, value.description ?? null, value.referenceId ?? null,
         value.price ?? null, value.suggestedRetailPrice ?? null, value.markup ?? null,
         value.media ? JSON.stringify(value.media) : null, value.attributes ? JSON.stringify(value.attributes) : null],
    );
    return result.rows[0] ?? null;
}

/** Substitui os dados editáveis de um produto local; diferente do update de
 * sync, aceita limpar campos opcionais. A origem não é alterada aqui. */
export async function replaceManualProductRow(
    client: PoolClient,
    id: string,
    value: ProductWriteRow,
): Promise<ProductRow | null> {
    const result = await client.query<ProductRow>(
        `UPDATE products SET name = $2, description = $3, reference_id = $4,
           price = $5, suggested_retail_price = $6, markup = $7, media = $8,
           attributes = $9, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1
         RETURNING ${productFields}`,
        [id, value.name, value.description ?? '', value.referenceId ?? null,
         value.price, value.suggestedRetailPrice ?? null,
         value.markup ?? null, JSON.stringify(value.media ?? {}),
         JSON.stringify(value.attributes ?? {})],
    );
    return result.rows[0] ?? null;
}

export async function replaceManualProductVariantsRow(
    client: PoolClient,
    productId: string,
    variants: Array<{ id?: string; color: string; size: string; price: number; availability: Availability; classificationIds: string[] }>,
): Promise<void> {
    // Desativar em vez de apagar preserva referências de estoque e histórico.
    await client.query(
        `UPDATE product_variants SET is_active = false, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND product_id = $1`,
        [productId],
    );
    for (const variant of variants) {
        if (variant.id) {
            const updated = await client.query<{ id: string }>(
                `UPDATE product_variants SET color = $3, size = $4, price = $5,
                   availability = $6, is_active = true, source_origin = 'manual'
                 WHERE tenant_id = app_tenant_id() AND id = $1 AND product_id = $2
                 RETURNING id`,
                [variant.id, productId, variant.color, variant.size, variant.price, variant.availability],
            );
            if (updated.rows[0]) {
                if (!await replaceManualVariantClassificationIdsRow(client, updated.rows[0].id, variant.classificationIds)) {
                    throw new Error("CLASSIFICATION_NOT_FOUND");
                }
                continue;
            }
        }
        const inserted = await client.query<{ id: string }>(
            `INSERT INTO product_variants (
               tenant_id, product_id, color, size, price, availability,
               track_inventory, is_active, source_origin
             ) VALUES (app_tenant_id(), $1, $2, $3, $4, $5, false, true, 'manual')
             ON CONFLICT (tenant_id, product_id, color, size) DO UPDATE SET
               price = EXCLUDED.price, availability = EXCLUDED.availability,
               is_active = true, source_origin = 'manual'
             RETURNING id`,
            [productId, variant.color, variant.size, variant.price, variant.availability],
        );
        if (!await replaceManualVariantClassificationIdsRow(client, inserted.rows[0].id, variant.classificationIds)) {
            throw new Error("CLASSIFICATION_NOT_FOUND");
        }
    }
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
         WHERE tenant_id = app_tenant_id() AND attributes ? 'manualOverride'
           AND source_origin <> 'erp'`,
    );
}

export async function findProductSourceOriginsByIds(
    client: PoolClient,
    productIds: string[],
): Promise<Record<string, ProductRow['source_origin']>> {
    if (productIds.length === 0) return {};
    const result = await client.query<Pick<ProductRow, 'id' | 'source_origin'>>(
        `SELECT id, source_origin FROM products
         WHERE tenant_id = app_tenant_id() AND id = ANY($1::uuid[])`,
        [productIds],
    );
    return Object.fromEntries(result.rows.map((row) => [row.id, row.source_origin]));
}

export async function setProductOverrideRow(client: PoolClient, productId: string, value: ProductOverrideRow): Promise<void> {
    await client.query(
        `UPDATE products SET attributes = jsonb_set(attributes, '{manualOverride}', $2::jsonb, true), updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1`,
        [productId, JSON.stringify(value)],
    );
}
