import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCatalog } from '@/lib/catalog';
import ProductDetailContent from '@/components/ProductDetailContent';

// productOverrides.json é editado pela plataforma admin e precisa
// refletir aqui sem rebuild — mesmo motivo de web/src/app/page.tsx.
export const dynamic = 'force-dynamic';

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const catalog = await getCatalog();
  const product = catalog.find((p) => p.id === id);
  if (!product) notFound();

  return (
    <main className="container product-page">
      <Link href="/" className="back-link">← Voltar ao catálogo</Link>
      <ProductDetailContent product={product} />
    </main>
  );
}
