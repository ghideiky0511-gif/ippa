import ToolsApp from '@/workspace/components/tools/ToolsApp';
import { fetchStoreSettings } from '@/workspace/lib/storeSettingsClient.server';
import { fetchSimilarProductsSettings } from '@/workspace/lib/similarProductsSettingsClient.server';
import { fetchCatalog } from '@/workspace/lib/catalogClient';
import { fetchClassifications } from '@/workspace/lib/classificationsClient.server';

export const dynamic = 'force-dynamic';

export default async function FerramentasPage() {
  let settings: Awaited<ReturnType<typeof fetchStoreSettings>> = {};
  let similarProductsSettings: Awaited<ReturnType<typeof fetchSimilarProductsSettings>> | null = null;
  let products: Awaited<ReturnType<typeof fetchCatalog>> = [];
  let classifications: Awaited<ReturnType<typeof fetchClassifications>> = [];
  let loadError: string | null = null;

  try {
    [settings, similarProductsSettings, products, classifications] = await Promise.all([
      fetchStoreSettings(),
      fetchSimilarProductsSettings(),
      fetchCatalog(),
      fetchClassifications(),
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
      initialClassifications={classifications}
    />
  );
}
