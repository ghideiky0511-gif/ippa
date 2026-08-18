import BuilderApp from '@/admin/components/builder/BuilderApp';
import { fetchHomeSections } from '@/admin/lib/homeSectionsClient';
import { fetchCatalog } from '@/admin/lib/catalogClient';

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
        <p>Confira se o serviço `backend` está rodando em localhost:3011.</p>
      </div>
    );
  }

  return <BuilderApp initialSections={sections} products={products} />;
}
