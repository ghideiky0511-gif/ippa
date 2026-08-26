import OrderDetailApp from '@/workspace/orders/OrderDetailApp';
import { fetchOrder } from '@/workspace/lib/ordersClient.server';
import { fetchClient } from '@/workspace/lib/customersClient.server';
import { fetchOrderPushStatus, fetchOrderPushHistory } from '@/workspace/lib/erpIntegrationClient.server';

export const dynamic = 'force-dynamic';

export default async function PedidoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let order: Awaited<ReturnType<typeof fetchOrder>> | null = null;
  let client: Awaited<ReturnType<typeof fetchClient>> | null = null;
  let pushStatus: Awaited<ReturnType<typeof fetchOrderPushStatus>> = null;
  let pushHistory: Awaited<ReturnType<typeof fetchOrderPushHistory>> = [];
  let loadError: string | null = null;

  try {
    [order, pushStatus, pushHistory] = await Promise.all([
      fetchOrder(id),
      fetchOrderPushStatus(id),
      fetchOrderPushHistory(id),
    ]);
    if (order.clientId) {
      client = await fetchClient(order.clientId);
    }
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Erro desconhecido';
  }

  if (loadError || !order) {
    return (
      <div style={{ padding: 40 }}>
        <p>Não foi possível carregar o pedido ({loadError ?? 'pedido não encontrado'}).</p>
      </div>
    );
  }

  return (
    <OrderDetailApp
      initialOrder={order}
      initialClient={client}
      initialPushStatus={pushStatus}
      initialPushHistory={pushHistory}
    />
  );
}
