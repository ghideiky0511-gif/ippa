import IntegracoesApp from '@/workspace/components/integracoes/IntegracoesApp';
import { fetchErpIntegrations } from '@/workspace/lib/erpIntegrationClient.server';
import { fetchPaymentIntegrations } from '@/workspace/lib/paymentIntegrationClient.server';

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

  if (loadError) {
    return (
      <div style={{ padding: 40 }}>
        <p>Não foi possível carregar as integrações ({loadError}).</p>
        <p>Confira se o serviço `backend` está rodando em localhost:3011.</p>
      </div>
    );
  }

  return <IntegracoesApp initialOptions={options} initialPaymentOptions={paymentOptions} />;
}
