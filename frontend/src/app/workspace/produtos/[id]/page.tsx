import ProductDetailApp from '@/workspace/components/products/ProductDetailApp';
import { fetchAdminProduct, fetchAdminProducts } from '@/workspace/lib/catalogClient.server';
import { fetchErpIntegrations } from '@/workspace/lib/erpIntegrationClient.server';

export const dynamic = 'force-dynamic';

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let result: { product: Awaited<ReturnType<typeof fetchAdminProduct>>; products: Awaited<ReturnType<typeof fetchAdminProducts>> } | null = null;
  let erpIntegrationActive = false;
  let loadError: string | null = null;
  try {
    const [product, products] = await Promise.all([fetchAdminProduct(id), fetchAdminProducts()]);
    result = { product, products };
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Produto não encontrado.';
  }
  if (!result) return <div style={{ padding: 40 }}>Não foi possível carregar o produto ({loadError}).</div>;
  try {
    const { options } = await fetchErpIntegrations();
    erpIntegrationActive = options.some((option) => option.active && option.configured);
  } catch {
    // Sem a configuração do ERP, mantenha o produto disponível, mas não exponha
    // uma ação de atualização que o backend necessariamente rejeitaria.
  }

  return <ProductDetailApp initialProduct={result.product} allProducts={result.products} erpIntegrationActive={erpIntegrationActive} />;
}
