import IntegracoesApp from '@/workspace/components/integracoes/IntegracoesApp';
import { fetchErpIntegrations } from '@/workspace/lib/erpIntegrationClient.server';
import { fetchPaymentIntegrations } from '@/workspace/lib/paymentIntegrationClient.server';
import { WorkspaceLoadError } from '@/workspace/components/shared/WorkspaceLoadError';

export const dynamic = 'force-dynamic';

export default async function IntegracoesPage() {
  let options: Awaited<ReturnType<typeof fetchErpIntegrations>>['options'] = [];
  let paymentOptions: Awaited<ReturnType<typeof fetchPaymentIntegrations>>['options'] = [];
  let loadError: string | null = null;

  try {
    [{ options }, { options: paymentOptions }] = await Promise.all([
      fetchErpIntegrations(),
      fetchPaymentIntegrations(),
    ]);
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Erro desconhecido';
  }

  if (loadError) return <WorkspaceLoadError message={`Não foi possível carregar as integrações (${loadError}).`} showBackendHint />;

  return <IntegracoesApp initialOptions={options} initialPaymentOptions={paymentOptions} />;
}
