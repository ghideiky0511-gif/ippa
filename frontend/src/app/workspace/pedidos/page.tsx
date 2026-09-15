import OrdersApp from '@/workspace/orders/OrdersApp';
import { fetchOrdersForHub, fetchOrderSessions } from '@/workspace/lib/ordersClient.server';
import { WorkspaceLoadError } from '@/workspace/components/shared/WorkspaceLoadError';

export const dynamic = 'force-dynamic';

export default async function PedidosPage() {
  let ordersResult: Awaited<ReturnType<typeof fetchOrdersForHub>> = { orders: [], invalidOrderCount: 0 };
  let sessions: Awaited<ReturnType<typeof fetchOrderSessions>> = [];
  let loadError: string | null = null;

  try {
    [ordersResult, sessions] = await Promise.all([
      fetchOrdersForHub(),
      fetchOrderSessions(),
    ]);
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Erro desconhecido';
  }

  if (loadError) return <WorkspaceLoadError message={`Não foi possível carregar o hub de pedidos (${loadError}).`} showBackendHint />;

  return (
    <OrdersApp
      initialOrders={ordersResult.orders}
      initialInvalidOrderCount={ordersResult.invalidOrderCount}
      initialSessions={sessions}
    />
  );
}
