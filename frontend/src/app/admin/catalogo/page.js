import CatalogOrderApp from '@/admin/components/catalog/CatalogOrderApp';
import { fetchCatalog } from '@/admin/lib/catalogClient';

export const dynamic = 'force-dynamic';

export default async function CatalogoPage() {
  let products = [];
  let loadError = null;

  try {
    products = await fetchCatalog();
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

  // fetchCatalog() já vem na ordem salva (GET /api/catalog aplica
  // applyCatalogOrder em web/src/lib/catalog.ts) — o estado inicial do
  // editor é só isso, sem precisar buscar a ordem separadamente.
  return <CatalogOrderApp products={products} />;
}
