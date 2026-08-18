import CollectionsApp from '@/admin/components/collections/CollectionsApp';
import { fetchHighlights } from '@/admin/lib/highlightsClient';
import { fetchCatalog } from '@/admin/lib/catalogClient';

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

  if (loadError) {
    return (
      <div style={{ padding: 40 }}>
        <p>Não foi possível carregar o catálogo ({loadError}).</p>
        <p>Confira se o serviço `backend` está rodando em localhost:3011.</p>
      </div>
    );
  }

  return <CollectionsApp initialHighlights={highlights} products={products} />;
}
