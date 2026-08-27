import OrderDetailApp from '@/workspace/orders/OrderDetailApp';
import { fetchOrder, fetchOrderSessions } from '@/workspace/lib/ordersClient.server';
import { fetchClient } from '@/workspace/lib/customersClient.server';
import { fetchOrderPushStatus, fetchOrderPushHistory } from '@/workspace/lib/erpIntegrationClient.server';
import type { OrderSession } from '@/domain/orders/types';

export const dynamic = 'force-dynamic';

export default async function PedidoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let order: Awaited<ReturnType<typeof fetchOrder>> | null = null;
  let client: Awaited<ReturnType<typeof fetchClient>> | null = null;
  let pushStatus: Awaited<ReturnType<typeof fetchOrderPushStatus>> = null;
  let pushHistory: Awaited<ReturnType<typeof fetchOrderPushHistory>> = [];
  let session: OrderSession | null = null;
  let loadError: string | null = null;

  try {
    let sessions: OrderSession[] = [];
    [order, pushStatus, pushHistory, sessions] = await Promise.all([
      fetchOrder(id),
      fetchOrderPushStatus(id),
      fetchOrderPushHistory(id),
      fetchOrderSessions(),
    ]);
    if (order.clientId) {
      client = await fetchClient(order.clientId);
    }
    // Upsell: atendimento que originou (ou alimentou) este pedido -- reabrir
    // ele é como o botão "Adicionar peças" chega ao mesmo fluxo de sempre
    // (catálogo + carrinho da sessão). Pode haver mais de uma sessão
    // apontando pro mesmo pedido (upsell prévio de outro atendimento); pega
    // a mais recente.
    session = sessions
      .filter((s) => s.orderId === order!.id)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0] ?? null;
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
      initialSession={session}
    />
  );
}
