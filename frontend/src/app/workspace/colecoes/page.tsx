import CollectionsApp from '@/workspace/components/collections/CollectionsApp';
import { fetchHighlights } from '@/workspace/lib/highlightsClient.server';
import { fetchCatalog } from '@/workspace/lib/catalogClient.server';
import { WorkspaceLoadError } from '@/workspace/components/shared/WorkspaceLoadError';

export const dynamic = 'force-dynamic';

export default async function ColecoesPage() {
  let highlights: Awaited<ReturnType<typeof fetchHighlights>> = [];
  let products: Awaited<ReturnType<typeof fetchCatalog>> = [];
  let loadError: string | null = null;

  try {
    [highlights, products] = await Promise.all([fetchHighlights(), fetchCatalog()]);
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Erro desconhecido';
  }

  if (loadError) return <WorkspaceLoadError message={`Não foi possível carregar o catálogo (${loadError}).`} showBackendHint />;

  return <CollectionsApp initialHighlights={highlights} products={products} />;
}
