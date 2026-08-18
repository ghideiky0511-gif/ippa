import InternalCatalogApp from '@/workspace/components/catalog/InternalCatalogApp';
import { fetchCatalog } from '@/workspace/lib/catalogClient';
import { fetchOrderBooks, fetchOrderSessions } from '@/workspace/lib/ordersClient.server';

export const dynamic = 'force-dynamic';

export default async function CatalogoPage() {
  let products: Awaited<ReturnType<typeof fetchCatalog>> = [];
  let books: Awaited<ReturnType<typeof fetchOrderBooks>> = [];
  let sessions: Awaited<ReturnType<typeof fetchOrderSessions>> = [];
  let loadError: string | null = null;

  try {
    [products, books, sessions] = await Promise.all([fetchCatalog(), fetchOrderBooks(), fetchOrderSessions()]);
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

  // fetchCatalog() já vem na ordem salva (GET /api/catalog aplica
  // applyCatalogOrder em web/src/lib/catalog.ts) — o estado inicial do
  // editor é só isso, sem precisar buscar a ordem separadamente.
  return <InternalCatalogApp products={products} initialBooks={books} initialSessions={sessions} />;
}
