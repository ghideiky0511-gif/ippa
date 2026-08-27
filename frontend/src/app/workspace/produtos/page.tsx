import ProductsApp from '@/workspace/components/products/ProductsApp';
import { fetchAdminProducts } from '@/workspace/lib/catalogClient.server';
import { fetchStoreSettings } from '@/workspace/lib/storeSettingsClient.server';
import { WorkspaceLoadError } from '@/workspace/components/shared/WorkspaceLoadError';

export const dynamic = 'force-dynamic';

export default async function ProdutosPage() {
  let products: Awaited<ReturnType<typeof fetchAdminProducts>> = [];
  let settings: Awaited<ReturnType<typeof fetchStoreSettings>> = {};
  let loadError: string | null = null;

  try {
    [products, settings] = await Promise.all([
      fetchAdminProducts(),
      fetchStoreSettings(),
    ]);
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Erro desconhecido';
  }

  if (loadError) return <WorkspaceLoadError message={`Não foi possível carregar o catálogo (${loadError}).`} showBackendHint />;

  return <ProductsApp products={products} initialSettings={settings} />;
}
