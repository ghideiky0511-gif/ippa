import type { PoolClient } from 'pg';
import type { Product, Variant } from '@/lib/types';

type ProductRow = {
  id: string; name: string; description: string; category: string; subcategory: string | null; collection: string | null; brand: string | null;
  sku: string | null; price: string; suggested_retail_price: string | null; markup: string | null; media: { image?: string; images?: string[]; imagesByColor?: Record<string, string>; videoUrl?: string }; attributes: Record<string, unknown>;
};

export async function listCatalog(client: PoolClient): Promise<Product[]> {
  const products = await client.query<ProductRow>(
    `SELECT id, name, description, category, subcategory, collection, brand, sku, price, suggested_retail_price, markup, media, attributes
     FROM products WHERE tenant_id = app_tenant_id() ORDER BY display_position NULLS LAST, created_at`,
  );
  if (products.rows.length === 0) return [];
  const variants = await client.query<{ product_id: string; id: string; color: string; size: string; price: string; availability: Variant['availability']; available_from: string | null; stock_qty: number | null }>(
    `SELECT product_id, id, color, size, price, availability, available_from, stock_qty
     FROM product_variants WHERE tenant_id = app_tenant_id() ORDER BY color, size`,
  );
  const byProduct = new Map<string, Variant[]>();
  for (const row of variants.rows) {
    const list = byProduct.get(row.product_id) ?? [];
    list.push({ id: row.id, color: row.color, size: row.size, price: Number(row.price), availability: row.availability, availableFrom: row.available_from ?? undefined, stockQty: row.stock_qty ?? undefined });
    byProduct.set(row.product_id, list);
  }
  return products.rows.map((row) => {
    const productVariants = byProduct.get(row.id) ?? [];
    const colors = [...new Set(productVariants.map((variant) => variant.color))];
    const sizes = [...new Set(productVariants.map((variant) => variant.size))];
    return {
      id: row.id, name: row.name, description: row.description, category: row.category, subcategory: row.subcategory ?? undefined,
      collection: row.collection ?? undefined, brand: row.brand ?? undefined, sku: row.sku ?? undefined, price: Number(row.price),
      suggestedRetailPrice: row.suggested_retail_price ? Number(row.suggested_retail_price) : undefined, markup: row.markup ? Number(row.markup) : undefined,
      image: row.media.image, images: row.media.images, imagesByColor: row.media.imagesByColor, videoUrl: row.media.videoUrl,
      colors, sizes, variants: productVariants,
      ...row.attributes,
    } as Product;
  });
}
