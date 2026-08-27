import CustomersApp from '@/workspace/customers/CustomersApp';
import { fetchClients } from '@/workspace/lib/customersClient.server';
import { WorkspaceLoadError } from '@/workspace/components/shared/WorkspaceLoadError';

export const dynamic = 'force-dynamic';

export default async function ClientesPage() {
  let clients: Awaited<ReturnType<typeof fetchClients>> | null = null;
  let loadError: string | null = null;

  try {
    clients = await fetchClients();
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Erro desconhecido';
  }

  if (loadError) return <WorkspaceLoadError message={`Não foi possível carregar os clientes (${loadError}).`} showBackendHint />;

  return <CustomersApp initialPage={clients!} />;
}
