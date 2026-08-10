import { NextRequest, NextResponse } from 'next/server';
import { getCatalog } from '@/lib/catalog';
import { computeSimilarProducts, getSimilarProductsSettings } from '@/lib/similarProducts';

// Resolve "produtos similares" pro quick-view e pro carrinho (ver
// web/src/lib/similarProducts.ts) — chamado só pelos componentes client do
// próprio `web` (mesma origem), não pelo admin, então sem CORS (diferente
// de /api/similar-products-settings e /api/product-overrides, que o admin
// edita cross-origin).
export async function POST(request: NextRequest) {
  const body = await request.json();
  const context = body?.context === 'cart' ? 'cart' : 'quickview';
  const productIds: string[] = Array.isArray(body?.productIds) ? body.productIds : [];

  const [catalog, settings] = await Promise.all([getCatalog(), getSimilarProductsSettings()]);
  const catalogById = new Map(catalog.map((p) => [p.id, p]));
  const anchors = productIds
    .map((id) => catalogById.get(id))
    .filter((p): p is (typeof catalog)[number] => !!p);

  const products = computeSimilarProducts(context, anchors, catalog, settings);
  return NextResponse.json({ products });
}
