import ToolsApp from '@/components/tools/ToolsApp';
import { fetchStoreSettings } from '@/lib/storeSettingsClient';
import { fetchSimilarProductsSettings } from '@/lib/similarProductsSettingsClient';
import { fetchCatalog } from '@/lib/catalogClient';

export const dynamic = 'force-dynamic';

export default async function FerramentasPage() {
  let settings = {};
  let similarProductsSettings = null;
  let products = [];
  let loadError = null;

  try {
    [settings, similarProductsSettings, products] = await Promise.all([
      fetchStoreSettings(),
      fetchSimilarProductsSettings(),
      fetchCatalog(),
    ]);
  } catch (err) {
    loadError = err.message;
  }

  if (loadError) {
    return (
      <div style={{ padding: 40 }}>
        <p>Não foi possível carregar as configurações da loja ({loadError}).</p>
        <p>Confira se o app `web` está rodando em localhost:3000.</p>
      </div>
    );
  }

  return (
    <ToolsApp
      initialSettings={settings}
      initialSimilarProductsSettings={similarProductsSettings}
      products={products}
    />
  );
}
