import Link from 'next/link';
import { notFound } from 'next/navigation';
import { backendJson } from '@/lib/backend';
import type { Product } from '@/domain/products/types';
import ProductDetailContent from '@/components/ProductDetailContent';
import SimilarProducts from '@/components/SimilarProducts';

// productOverrides.json é editado pela plataforma admin e precisa
// refletir aqui sem rebuild — mesmo motivo de web/src/app/page.tsx.
export const dynamic = 'force-dynamic';

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const catalog = await backendJson<Product[]>('/api/catalog');
  const product = catalog.find((p) => p.id === id);
  if (!product) notFound();

  // Mesma âncora única do quick-view (o produto sendo visto) — reaproveita
  // a regra de "quickview" (ver decisão em PLANO-PROXIMOS-PASSOS.md/plano
  // desta conversa), então editar em /ferramentas afeta as duas telas.
  const { products: similar } = await backendJson<{ products: Product[] }>('/api/similar-products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context: 'quickview', productIds: [product.id] }),
  });

  return (
    <main className="container product-page">
      <Link href="/" className="back-link">← Voltar ao catálogo</Link>
      <ProductDetailContent product={product} />
      <SimilarProducts products={similar} />
    </main>
  );
}
