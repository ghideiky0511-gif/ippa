import OrdersApp from '@/workspace/orders/OrdersApp';
import { fetchOrders } from '@/workspace/lib/ordersClient.server';

export const dynamic = 'force-dynamic';

export default async function PedidosPage() {
  let orders: Awaited<ReturnType<typeof fetchOrders>> = [];
  let loadError: string | null = null;

  try {
    orders = await fetchOrders();
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Erro desconhecido';
  }

  if (loadError) {
    return <div style={{ padding: 40 }}>Não foi possível carregar os pedidos ({loadError}).</div>;
  }

  return <OrdersApp initialOrders={orders} />;
}
