import type { PoolClient } from 'pg';
import type { Product, Variant } from '@/lib/types';

type ProductRow = {
  id: string; name: string; description: string; category: string | null; subcategory: string | null; collection: string | null; brand: string | null;
  sku: string | null; price: string; suggested_retail_price: string | null; markup: string | null; media: { image?: string; images?: string[]; imagesByColor?: Record<string, string>; videoUrl?: string }; attributes: Record<string, unknown>;
};

export async function listCatalog(client: PoolClient): Promise<Product[]> {
  const products = await client.query<ProductRow>(
    `SELECT id, name, description, category, subcategory, collection, brand, sku, price, suggested_retail_price, markup, media, attributes
     FROM products WHERE tenant_id = app_tenant_id() ORDER BY display_position NULLS LAST, created_at`,
  );
  if (products.rows.length === 0) return [];
  const variants = await client.query<{ product_id: string; id: string; color: string; size: string; price: string; availability: Variant['availability']; available_from: string | null; track_inventory: boolean }>(
    `SELECT product_id, id, color, size, price, availability, available_from, track_inventory
     FROM product_variants WHERE tenant_id = app_tenant_id() ORDER BY color, size`,
  );
  const balances = await client.query<{ variant_id: string; stock_qty: number }>(
    `SELECT balance.variant_id, SUM(balance.available_qty)::integer AS stock_qty
     FROM inventory_balances balance
     JOIN inventory_locations location ON location.id = balance.location_id
     WHERE balance.tenant_id = app_tenant_id() AND location.active
     GROUP BY balance.variant_id`,
  );
  const classifications = await client.query<{ product_id: string; kind: 'category' | 'subcategory' | 'collection' | 'brand'; name: string }>(
    `SELECT link.product_id, type.kind, classification.name
     FROM product_classifications link
     JOIN classifications classification ON classification.id = link.classification_id
     JOIN classification_types type ON type.id = link.classification_type_id
     WHERE link.tenant_id = app_tenant_id() AND link.is_primary`,
  );
  const stockByVariant = new Map(balances.rows.map((row) => [row.variant_id, row.stock_qty]));
  const classificationsByProduct = new Map<string, Partial<Record<'category' | 'subcategory' | 'collection' | 'brand', string>>>();
  for (const row of classifications.rows) {
    classificationsByProduct.set(row.product_id, { ...classificationsByProduct.get(row.product_id), [row.kind]: row.name });
  }
  const byProduct = new Map<string, Variant[]>();
  for (const row of variants.rows) {
    const list = byProduct.get(row.product_id) ?? [];
    list.push({ id: row.id, color: row.color, size: row.size, price: Number(row.price), availability: row.availability, availableFrom: row.available_from ?? undefined, stockQty: row.track_inventory ? (stockByVariant.get(row.id) ?? 0) : undefined });
    byProduct.set(row.product_id, list);
  }
  return products.rows.map((row) => {
    const productVariants = byProduct.get(row.id) ?? [];
    const colors = [...new Set(productVariants.map((variant) => variant.color))];
    const sizes = [...new Set(productVariants.map((variant) => variant.size))];
    const classification = classificationsByProduct.get(row.id);
    return {
      id: row.id, name: row.name, description: row.description, category: classification?.category ?? row.category ?? 'Sem categoria', subcategory: classification?.subcategory ?? row.subcategory ?? undefined,
      collection: classification?.collection ?? row.collection ?? undefined, brand: classification?.brand ?? row.brand ?? undefined, sku: row.sku ?? undefined, price: Number(row.price),
      suggestedRetailPrice: row.suggested_retail_price ? Number(row.suggested_retail_price) : undefined, markup: row.markup ? Number(row.markup) : undefined,
      image: row.media.image, images: row.media.images, imagesByColor: row.media.imagesByColor, videoUrl: row.media.videoUrl,
      colors, sizes, variants: productVariants,
      ...row.attributes,
    } as Product;
  });
}
