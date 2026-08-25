import ClientDetailApp from '@/workspace/customers/ClientDetailApp';
import { fetchClient } from '@/workspace/lib/customersClient.server';
import { fetchOrders } from '@/workspace/lib/ordersClient.server';

export const dynamic = 'force-dynamic';

export default async function ClienteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let client: Awaited<ReturnType<typeof fetchClient>> | null = null;
  let orders: Awaited<ReturnType<typeof fetchOrders>> = [];
  let loadError: string | null = null;

  try {
    [client, orders] = await Promise.all([fetchClient(id), fetchOrders({ clientId: id })]);
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Erro desconhecido';
  }

  if (loadError || !client) {
    return (
      <div style={{ padding: 40 }}>
        <p>Não foi possível carregar a cliente ({loadError ?? 'cadastro não encontrado'}).</p>
      </div>
    );
  }

  return <ClientDetailApp initialClient={client} initialOrders={orders} />;
}
