import ClientDetailApp from '@/workspace/customers/ClientDetailApp';
import { fetchClient } from '@/workspace/lib/customersClient.server';
import { fetchOrders } from '@/workspace/lib/ordersClient.server';
import { WorkspaceLoadError } from '@/workspace/components/shared/WorkspaceLoadError';

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

  if (loadError || !client) return <WorkspaceLoadError message={`Não foi possível carregar a cliente (${loadError ?? 'cadastro não encontrado'}).`} />;

  return <ClientDetailApp initialClient={client} initialOrders={orders} />;
}
