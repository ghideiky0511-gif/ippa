import ToolsApp from '@/workspace/components/tools/ToolsApp';
import { fetchStoreSettings } from '@/workspace/lib/storeSettingsClient.server';
import { fetchSimilarProductsSettings } from '@/workspace/lib/similarProductsSettingsClient.server';
import { fetchCatalog } from '@/workspace/lib/catalogClient.server';
import { fetchClassifications } from '@/workspace/lib/classificationsClient.server';
import { WorkspaceLoadError } from '@/workspace/components/shared/WorkspaceLoadError';

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

  if (loadError) return <WorkspaceLoadError message={`Não foi possível carregar as configurações da loja (${loadError}).`} showBackendHint />;

  return (
    <ToolsApp
      initialSettings={settings}
      initialSimilarProductsSettings={similarProductsSettings}
      products={products}
      initialClassifications={classifications}
    />
  );
}
