import type { PoolClient } from "pg";
import type { AssignmentStrategy, BannerMediaType, DiscountType, HomeSectionType, SimilarProductsSettings } from "@/lib/types";

export interface StoreSettingsRow {
    default_markup: string | null;
    assignment_strategy: AssignmentStrategy | null;
    payment_link_expiration_minutes: number;
    features: Record<string, boolean>;
}
export interface DiscountRow { id: string; label: string; active: boolean; type: DiscountType; percent: string }
export interface DiscountTierRow { discount_id: string; min_qty: number; percent: string }
export interface DiscountProductRow { discount_id: string; product_id: string }
export interface HighlightRow { id: string; label: string }
export interface HighlightProductRow { highlight_id: string; product_id: string }
export interface HomeSectionRow { id: string; type: HomeSectionType; product_id: string | null; layout: Record<string, number> }
export interface HomeBannerRow {
    home_section_id: string; id: string; type: BannerMediaType; media_url: string;
    title: string | null; subtitle: string | null;
}

export async function findStoreSettingsRow(client: PoolClient): Promise<StoreSettingsRow | null> {
    const result = await client.query<StoreSettingsRow>(
        `SELECT default_markup, assignment_strategy, payment_link_expiration_minutes, features
         FROM store_settings WHERE tenant_id = app_tenant_id()`,
    );
    return result.rows[0] ?? null;
}

export async function upsertStoreSettingsRow(client: PoolClient, settings: {
    defaultMarkup: number | null; assignmentStrategy: AssignmentStrategy | null;
    paymentLinkExpirationMinutes: number; features: Record<string, boolean>;
}): Promise<void> {
    await client.query(
        `INSERT INTO store_settings (tenant_id, default_markup, assignment_strategy, payment_link_expiration_minutes, features, updated_at)
         VALUES (app_tenant_id(), $1, $2, $3, $4, now())
         ON CONFLICT (tenant_id) DO UPDATE SET default_markup = EXCLUDED.default_markup,
           assignment_strategy = EXCLUDED.assignment_strategy,
           payment_link_expiration_minutes = EXCLUDED.payment_link_expiration_minutes,
           features = EXCLUDED.features, updated_at = now()`,
        [settings.defaultMarkup, settings.assignmentStrategy, settings.paymentLinkExpirationMinutes,
         JSON.stringify(settings.features)],
    );
}

export async function listDiscountRows(client: PoolClient): Promise<DiscountRow[]> {
    const result = await client.query<DiscountRow>(
        "SELECT id, label, active, type, percent FROM discounts WHERE tenant_id = app_tenant_id() ORDER BY label",
    );
    return result.rows;
}
export async function listDiscountTierRows(client: PoolClient): Promise<DiscountTierRow[]> {
    const result = await client.query<DiscountTierRow>(
        "SELECT discount_id, min_qty, percent FROM discount_tiers WHERE tenant_id = app_tenant_id() ORDER BY min_qty",
    );
    return result.rows;
}
export async function listDiscountProductRows(client: PoolClient): Promise<DiscountProductRow[]> {
    const result = await client.query<DiscountProductRow>(
        "SELECT discount_id, product_id FROM discount_products WHERE tenant_id = app_tenant_id()",
    );
    return result.rows;
}
export async function listHighlightRows(client: PoolClient): Promise<HighlightRow[]> {
    const result = await client.query<HighlightRow>(
        "SELECT id, label FROM highlights WHERE tenant_id = app_tenant_id() ORDER BY label",
    );
    return result.rows;
}
export async function listHighlightProductRows(client: PoolClient): Promise<HighlightProductRow[]> {
    const result = await client.query<HighlightProductRow>(
        "SELECT highlight_id, product_id FROM highlight_products WHERE tenant_id = app_tenant_id() ORDER BY position",
    );
    return result.rows;
}
export async function listHomeSectionRows(client: PoolClient): Promise<HomeSectionRow[]> {
    const result = await client.query<HomeSectionRow>(
        "SELECT id, type, product_id, layout FROM home_sections WHERE tenant_id = app_tenant_id() ORDER BY position",
    );
    return result.rows;
}
export async function listHomeBannerRows(client: PoolClient): Promise<HomeBannerRow[]> {
    const result = await client.query<HomeBannerRow>(
        "SELECT home_section_id, id, type, media_url, title, subtitle FROM home_banners WHERE tenant_id = app_tenant_id() ORDER BY position",
    );
    return result.rows;
}
export async function findSimilarProductsSettingsRow(client: PoolClient): Promise<SimilarProductsSettings | null> {
    const result = await client.query<{ similar_products_settings: SimilarProductsSettings | null }>(
        "SELECT similar_products_settings FROM store_settings WHERE tenant_id = app_tenant_id()",
    );
    return result.rows[0]?.similar_products_settings ?? null;
}

export async function deleteDiscountRows(client: PoolClient): Promise<void> {
    await client.query("DELETE FROM discounts WHERE tenant_id = app_tenant_id()");
}

export async function insertDiscountRow(client: PoolClient, discount: {
    id: string; label: string; active: boolean; type: DiscountType; percent: number;
}): Promise<void> {
    await client.query(
        `INSERT INTO discounts (id, tenant_id, label, active, type, percent)
         VALUES ($1, app_tenant_id(), $2, $3, $4, $5)`,
        [discount.id, discount.label, discount.active, discount.type, discount.percent],
    );
}

export async function insertDiscountTierRow(client: PoolClient, discountId: string, minQty: number, percent: number): Promise<void> {
    await client.query(
        `INSERT INTO discount_tiers (tenant_id, discount_id, min_qty, percent)
         VALUES (app_tenant_id(), $1, $2, $3)`,
        [discountId, minQty, percent],
    );
}

export async function insertDiscountProductRow(client: PoolClient, discountId: string, productId: string): Promise<void> {
    await client.query(
        `INSERT INTO discount_products (tenant_id, discount_id, product_id)
         VALUES (app_tenant_id(), $1, $2)`,
        [discountId, productId],
    );
}

export async function deleteHighlightRows(client: PoolClient): Promise<void> {
    await client.query("DELETE FROM highlights WHERE tenant_id = app_tenant_id()");
}

export async function insertHighlightRow(client: PoolClient, value: HighlightRow): Promise<void> {
    await client.query(
        `INSERT INTO highlights (id, tenant_id, label) VALUES ($1, app_tenant_id(), $2)`,
        [value.id, value.label],
    );
}

export async function insertHighlightProductRow(client: PoolClient, highlightId: string, productId: string, position: number): Promise<void> {
    await client.query(
        `INSERT INTO highlight_products (tenant_id, highlight_id, product_id, position)
         VALUES (app_tenant_id(), $1, $2, $3)`,
        [highlightId, productId, position],
    );
}

export async function deleteHomeSectionRows(client: PoolClient): Promise<void> {
    await client.query("DELETE FROM home_sections WHERE tenant_id = app_tenant_id()");
}

export async function insertHomeSectionRow(client: PoolClient, value: {
    id: string; type: HomeSectionType; productId?: string; layout: Record<string, number>; position: number;
}): Promise<void> {
    await client.query(
        `INSERT INTO home_sections (id, tenant_id, type, product_id, layout, position)
         VALUES ($1, app_tenant_id(), $2, $3, $4, $5)`,
        [value.id, value.type, value.productId ?? null, JSON.stringify(value.layout), value.position],
    );
}

export async function insertHomeBannerRow(client: PoolClient, sectionId: string, value: {
    id: string; type: BannerMediaType; mediaUrl: string; title?: string; subtitle?: string; position: number;
}): Promise<void> {
    await client.query(
        `INSERT INTO home_banners (id, tenant_id, home_section_id, type, media_url, title, subtitle, position)
         VALUES ($1, app_tenant_id(), $2, $3, $4, $5, $6, $7)`,
        [value.id, sectionId, value.type, value.mediaUrl, value.title ?? null, value.subtitle ?? null, value.position],
    );
}

export async function upsertSimilarProductsSettingsRow(client: PoolClient, settings: SimilarProductsSettings): Promise<void> {
    await client.query(
        `INSERT INTO store_settings (tenant_id, similar_products_settings)
         VALUES (app_tenant_id(), $1)
         ON CONFLICT (tenant_id) DO UPDATE SET similar_products_settings = EXCLUDED.similar_products_settings,
           updated_at = now()`,
        [JSON.stringify(settings)],
    );
}
