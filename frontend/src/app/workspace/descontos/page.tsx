import DiscountsApp from '@/workspace/components/discounts/DiscountsApp';
import { fetchDiscounts } from '@/workspace/lib/discountsClient.server';
import { fetchCatalog } from '@/workspace/lib/catalogClient.server';
import { WorkspaceLoadError } from '@/workspace/components/shared/WorkspaceLoadError';

export const dynamic = 'force-dynamic';

export default async function DescontosPage() {
  let discounts: Awaited<ReturnType<typeof fetchDiscounts>> = [];
  let products: Awaited<ReturnType<typeof fetchCatalog>> = [];
  let loadError: string | null = null;

  try {
    [discounts, products] = await Promise.all([fetchDiscounts(), fetchCatalog()]);
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Erro desconhecido';
  }

  if (loadError) return <WorkspaceLoadError message={`Não foi possível carregar os descontos (${loadError}).`} showBackendHint />;

  return <DiscountsApp initialDiscounts={discounts} products={products} />;
}
