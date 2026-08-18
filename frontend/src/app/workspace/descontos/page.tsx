import DiscountsApp from '@/workspace/components/discounts/DiscountsApp';
import { fetchDiscounts } from '@/workspace/lib/discountsClient.server';
import { fetchCatalog } from '@/workspace/lib/catalogClient';

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

  if (loadError) {
    return (
      <div style={{ padding: 40 }}>
        <p>Não foi possível carregar os descontos ({loadError}).</p>
        <p>Confira se o serviço `backend` está rodando em localhost:3011.</p>
      </div>
    );
  }

  return <DiscountsApp initialDiscounts={discounts} products={products} />;
}
