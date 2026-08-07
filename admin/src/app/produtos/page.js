import ProductsApp from '@/components/products/ProductsApp';
import { fetchCatalog } from '@/lib/catalogClient';
import { fetchProductOverrides } from '@/lib/productOverridesClient';
import { fetchStoreSettings } from '@/lib/storeSettingsClient';

export const dynamic = 'force-dynamic';

export default async function ProdutosPage() {
  let products = [];
  let overrides = {};
  let settings = {};
  let loadError = null;

  try {
    [products, overrides, settings] = await Promise.all([
      fetchCatalog(),
      fetchProductOverrides(),
      fetchStoreSettings(),
    ]);
  } catch (err) {
    loadError = err.message;
  }

  if (loadError) {
    return (
      <div style={{ padding: 40 }}>
        <p>Não foi possível carregar o catálogo ({loadError}).</p>
        <p>Confira se o app `web` está rodando em localhost:3000.</p>
      </div>
    );
  }

  return <ProductsApp products={products} initialOverrides={overrides} initialSettings={settings} />;
}
