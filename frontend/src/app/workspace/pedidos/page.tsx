import OrdersApp from '@/workspace/orders/OrdersApp';
import { fetchOrders, fetchOrderSessions } from '@/workspace/lib/ordersClient.server';
import { WorkspaceLoadError } from '@/workspace/components/shared/WorkspaceLoadError';

export const dynamic = 'force-dynamic';

export default async function PedidosPage() {
  let orders: Awaited<ReturnType<typeof fetchOrders>> = [];
  let sessions: Awaited<ReturnType<typeof fetchOrderSessions>> = [];
  let loadError: string | null = null;

  try {
    [orders, sessions] = await Promise.all([
      fetchOrders(),
      fetchOrderSessions(),
    ]);
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Erro desconhecido';
  }

  if (loadError) return <WorkspaceLoadError message={`Não foi possível carregar o hub de pedidos (${loadError}).`} showBackendHint />;

  return <OrdersApp initialOrders={orders} initialSessions={sessions} />;
}
