import BuilderApp from '@/workspace/components/builder/BuilderApp';
import { fetchHomeSections } from '@/workspace/lib/homeSectionsClient.server';
import { WorkspaceLoadError } from '@/workspace/components/shared/WorkspaceLoadError';

export const dynamic = 'force-dynamic';

export default async function BuilderPage() {
  let sections: Awaited<ReturnType<typeof fetchHomeSections>> = [];
  let loadError: string | null = null;

  try {
    sections = await fetchHomeSections();
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Erro desconhecido';
  }

  if (loadError) return <WorkspaceLoadError message={`Não foi possível carregar o catálogo (${loadError}).`} showBackendHint />;

  return <BuilderApp initialSections={sections} />;
}
