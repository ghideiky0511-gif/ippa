import ToolsApp from '@/workspace/components/tools/ToolsApp';
import { fetchStoreSettings } from '@/workspace/lib/storeSettingsClient';
import { fetchSimilarProductsSettings } from '@/workspace/lib/similarProductsSettingsClient';
import { fetchCatalog } from '@/workspace/lib/catalogClient';

export const dynamic = 'force-dynamic';

export default async function FerramentasPage() {
  let settings: Awaited<ReturnType<typeof fetchStoreSettings>> = {};
  let similarProductsSettings: Awaited<ReturnType<typeof fetchSimilarProductsSettings>> | null = null;
  let products: Awaited<ReturnType<typeof fetchCatalog>> = [];
  let loadError: string | null = null;

  try {
    [settings, similarProductsSettings, products] = await Promise.all([
      fetchStoreSettings(),
      fetchSimilarProductsSettings(),
      fetchCatalog(),
    ]);
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Erro desconhecido';
  }

  if (loadError) {
    return (
      <div style={{ padding: 40 }}>
        <p>Não foi possível carregar as configurações da loja ({loadError}).</p>
        <p>Confira se o serviço `backend` está rodando em localhost:3011.</p>
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
