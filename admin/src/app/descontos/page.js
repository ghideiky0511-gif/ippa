import DiscountsApp from '@/components/discounts/DiscountsApp';
import { fetchDiscounts } from '@/lib/discountsClient';
import { fetchCatalog } from '@/lib/catalogClient';

export const dynamic = 'force-dynamic';

export default async function DescontosPage() {
  let discounts = [];
  let products = [];
  let loadError = null;

  try {
    [discounts, products] = await Promise.all([fetchDiscounts(), fetchCatalog()]);
  } catch (err) {
    loadError = err.message;
  }

  if (loadError) {
    return (
      <div style={{ padding: 40 }}>
        <p>Não foi possível carregar os descontos ({loadError}).</p>
        <p>Confira se o app `web` está rodando em localhost:3000.</p>
      </div>
    );
  }

  return <DiscountsApp initialDiscounts={discounts} products={products} />;
}
