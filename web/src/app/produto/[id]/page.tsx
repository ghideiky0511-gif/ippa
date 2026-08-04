import Link from 'next/link';
import { notFound } from 'next/navigation';
import catalog from '@/data/catalog.json';
import ProductDetailContent from '@/components/ProductDetailContent';

export default async function ProductPage({ params }) {
  const { id } = await params;
  const product = catalog.find((p) => p.id === id);
  if (!product) notFound();

  return (
    <main className="container product-page">
      <Link href="/" className="back-link">← Voltar ao catálogo</Link>
      <ProductDetailContent product={product} />
    </main>
  );
}
