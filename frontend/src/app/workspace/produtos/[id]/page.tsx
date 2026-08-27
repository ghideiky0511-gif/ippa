import ProductDetailApp from '@/workspace/components/products/ProductDetailApp';
import { fetchAdminProduct, fetchAdminProducts } from '@/workspace/lib/catalogClient.server';

export const dynamic = 'force-dynamic';

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let result: { product: Awaited<ReturnType<typeof fetchAdminProduct>>; products: Awaited<ReturnType<typeof fetchAdminProducts>> } | null = null;
  let loadError: string | null = null;
  try {
    const [product, products] = await Promise.all([fetchAdminProduct(id), fetchAdminProducts()]);
    result = { product, products };
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Produto não encontrado.';
  }
  if (!result) return <div style={{ padding: 40 }}>Não foi possível carregar o produto ({loadError}).</div>;
  return <ProductDetailApp initialProduct={result.product} allProducts={result.products} />;
}
