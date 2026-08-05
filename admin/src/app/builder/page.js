import BuilderApp from '@/components/builder/BuilderApp';
import { fetchHomeSections } from '@/lib/homeSectionsClient';
import { fetchCatalog } from '@/lib/catalogClient';

export const dynamic = 'force-dynamic';

export default async function BuilderPage() {
  let sections = [];
  let products = [];
  let loadError = null;

  try {
    [sections, products] = await Promise.all([fetchHomeSections(), fetchCatalog()]);
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

  return <BuilderApp initialSections={sections} products={products} />;
}
