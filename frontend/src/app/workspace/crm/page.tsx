import CrmApp from '@/workspace/crm/CrmApp';
import { fetchClients } from '@/workspace/lib/customersClient.server';
import { fetchCrmInboxes } from '@/workspace/lib/crmClient.server';
import { WorkspaceLoadError } from '@/workspace/components/shared/WorkspaceLoadError';

export const dynamic = 'force-dynamic';

export default async function CrmPage() {
  let clients: Awaited<ReturnType<typeof fetchClients>> | null = null;
  let inboxes: Awaited<ReturnType<typeof fetchCrmInboxes>> = [];
  let loadError: string | null = null;

  try {
    [clients, inboxes] = await Promise.all([fetchClients(), fetchCrmInboxes()]);
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Erro desconhecido';
  }

  if (loadError) return <WorkspaceLoadError message={`Não foi possível abrir o CRM (${loadError}).`} showBackendHint />;

  return <CrmApp initialClients={clients!} initialInboxes={inboxes} />;
}
