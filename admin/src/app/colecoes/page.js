import CollectionsApp from '@/components/collections/CollectionsApp';
import { fetchHighlights } from '@/lib/highlightsClient';
import { fetchCatalog } from '@/lib/catalogClient';

export const dynamic = 'force-dynamic';

export default async function ColecoesPage() {
  let highlights = [];
  let products = [];
  let loadError = null;

  try {
    [highlights, products] = await Promise.all([fetchHighlights(), fetchCatalog()]);
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

  return <CollectionsApp initialHighlights={highlights} products={products} />;
}
