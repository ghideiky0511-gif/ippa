import ProductsApp from '@/workspace/components/products/ProductsApp';
import { fetchCatalog } from '@/workspace/lib/catalogClient';
import { fetchProductOverrides } from '@/workspace/lib/productOverridesClient.server';
import { fetchStoreSettings } from '@/workspace/lib/storeSettingsClient.server';

export const dynamic = 'force-dynamic';

export default async function ProdutosPage() {
  let products: Awaited<ReturnType<typeof fetchCatalog>> = [];
  let overrides: Awaited<ReturnType<typeof fetchProductOverrides>> = {};
  let settings: Awaited<ReturnType<typeof fetchStoreSettings>> = {};
  let loadError: string | null = null;

  try {
    [products, overrides, settings] = await Promise.all([
      fetchCatalog(),
      fetchProductOverrides(),
      fetchStoreSettings(),
    ]);
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Erro desconhecido';
  }

  if (loadError) {
    return (
      <div style={{ padding: 40 }}>
        <p>Não foi possível carregar o catálogo ({loadError}).</p>
        <p>Confira se o serviço `backend` está rodando em localhost:3011.</p>
      </div>
    );
  }

  return <ProductsApp products={products} initialOverrides={overrides} initialSettings={settings} />;
}
