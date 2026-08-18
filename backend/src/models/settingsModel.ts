import type { PoolClient } from 'pg';
import type { Discount, Highlight, HomeSection, SimilarProductsSettings } from '@/lib/types';
import type { StoreSettings } from '@/lib/storeSettings';

export async function getStoreSettings(client: PoolClient): Promise<StoreSettings> {
  const result = await client.query<{ default_markup: string | null; assignment_strategy: StoreSettings['assignmentStrategy']; payment_link_expiration_minutes: number; features: Record<string, boolean> }>(
    `SELECT default_markup, assignment_strategy, payment_link_expiration_minutes, features
     FROM store_settings WHERE tenant_id = app_tenant_id()`,
  );
  const row = result.rows[0];
  return row ? { defaultMarkup: row.default_markup ? Number(row.default_markup) : undefined, assignmentStrategy: row.assignment_strategy ?? undefined, paymentLinkExpirationMinutes: row.payment_link_expiration_minutes, features: row.features } : {};
}

export async function replaceStoreSettings(client: PoolClient, settings: StoreSettings): Promise<StoreSettings> {
  await client.query(
    `INSERT INTO store_settings (tenant_id, default_markup, assignment_strategy, payment_link_expiration_minutes, features, updated_at)
     VALUES (app_tenant_id(), $1, $2, $3, $4, now())
     ON CONFLICT (tenant_id) DO UPDATE SET default_markup = EXCLUDED.default_markup, assignment_strategy = EXCLUDED.assignment_strategy,
       payment_link_expiration_minutes = EXCLUDED.payment_link_expiration_minutes, features = EXCLUDED.features, updated_at = now()`,
    [settings.defaultMarkup ?? null, settings.assignmentStrategy ?? null, settings.paymentLinkExpirationMinutes ?? 15, JSON.stringify(settings.features ?? {})],
  );
  return getStoreSettings(client);
}

export async function listDiscounts(client: PoolClient): Promise<Discount[]> {
  const discounts = await client.query<{ id: string; label: string; active: boolean; type: Discount['type']; percent: string }>(
    `SELECT id, label, active, type, percent FROM discounts WHERE tenant_id = app_tenant_id() ORDER BY label`,
  );
  const [tiers, products] = await Promise.all([
    client.query<{ discount_id: string; min_qty: number; percent: string }>(`SELECT discount_id, min_qty, percent FROM discount_tiers WHERE tenant_id = app_tenant_id() ORDER BY min_qty`),
    client.query<{ discount_id: string; product_id: string }>(`SELECT discount_id, product_id FROM discount_products WHERE tenant_id = app_tenant_id()`),
  ]);
  return discounts.rows.map((discount) => ({
    id: discount.id, label: discount.label, active: discount.active, type: discount.type, percent: Number(discount.percent),
    tiers: tiers.rows.filter((tier) => tier.discount_id === discount.id).map((tier) => ({ minQty: tier.min_qty, percent: Number(tier.percent) })),
    productIds: products.rows.filter((product) => product.discount_id === discount.id).map((product) => product.product_id),
  }));
}

export async function listHighlights(client: PoolClient): Promise<Highlight[]> {
  const highlights = await client.query<{ id: string; label: string }>(`SELECT id, label FROM highlights WHERE tenant_id = app_tenant_id() ORDER BY label`);
  const products = await client.query<{ highlight_id: string; product_id: string }>(`SELECT highlight_id, product_id FROM highlight_products WHERE tenant_id = app_tenant_id() ORDER BY position`);
  return highlights.rows.map((highlight) => ({ id: highlight.id, label: highlight.label, productIds: products.rows.filter((product) => product.highlight_id === highlight.id).map((product) => product.product_id) }));
}

export async function listHomeSections(client: PoolClient): Promise<HomeSection[]> {
  const sections = await client.query<{ id: string; type: 'banner' | 'product'; product_id: string | null; layout: Record<string, number> }>(
    `SELECT id, type, product_id, layout FROM home_sections WHERE tenant_id = app_tenant_id() ORDER BY position`,
  );
  const banners = await client.query<{ home_section_id: string; id: string; type: 'image' | 'video'; media_url: string; title: string | null; subtitle: string | null }>(
    `SELECT home_section_id, id, type, media_url, title, subtitle FROM home_banners WHERE tenant_id = app_tenant_id() ORDER BY position`,
  );
  return sections.rows.map((section) => section.type === 'product'
    ? { type: 'product', id: section.id, productId: section.product_id!, ...section.layout }
    : { type: 'banner', id: section.id, banners: banners.rows.filter((banner) => banner.home_section_id === section.id).map((banner) => ({ id: banner.id, type: banner.type, mediaUrl: banner.media_url, title: banner.title ?? undefined, subtitle: banner.subtitle ?? undefined })), ...section.layout });
}

export async function getSimilarProductsSettings(client: PoolClient): Promise<SimilarProductsSettings> {
  const result = await client.query<{ similar_products_settings: SimilarProductsSettings }>(`SELECT similar_products_settings FROM store_settings WHERE tenant_id = app_tenant_id()`);
  return result.rows[0]?.similar_products_settings ?? { quickview: { limit: 4, rules: ['sameCategory'] }, cart: { limit: 4, rules: ['sameCategory'] }, complementaryCategories: {} };
}
