import { ArrowLeft } from 'lucide-react';
import OrderPaymentDetails from '@/components/payments/OrderPaymentDetails';
import { fetchOrder } from '@/workspace/lib/ordersClient.server';
import { HubHeader } from '@/workspace/components/shared/HubHeader';
import { WorkspaceLoadError } from '@/workspace/components/shared/WorkspaceLoadError';
import Link from '@/components/TenantLink';
import { adminUi } from '@/workspace/lib/ui';

export const dynamic = 'force-dynamic';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export default async function PedidoPagamentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let order: Awaited<ReturnType<typeof fetchOrder>> | null = null;
  let loadError: string | null = null;

  try {
    order = await fetchOrder(id);
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Erro desconhecido';
  }

  if (loadError || !order) return <WorkspaceLoadError message={`Não foi possível carregar o pedido (${loadError ?? 'pedido não encontrado'}).`} />;

  return (
    <div>
      <HubHeader
        title={`Pagamento — Pedido nº ${order.orderNumber}`}
        description={`${order.clientName ? `${order.clientName} · ` : ''}${formatCurrency(order.total)}`}
        secondaryActions={
          <Link href={`/workspace/pedidos/${id}`} className={adminUi.button}>
            <ArrowLeft className="mr-1.5 inline size-3.5" aria-hidden="true" />Voltar ao pedido
          </Link>
        }
      />

      <main className={`${adminUi.productsEditor} flex flex-col gap-6`}>
        <section className="rounded-brand border border-border bg-surface p-4">
          <h2 className="font-bold">Cobranças</h2>
          <p className="mt-1 text-sm text-muted-foreground">Histórico de tentativas de cobrança deste pedido, incluindo tentativas anteriores canceladas.</p>
          <div className="mt-3">
            <OrderPaymentDetails orderId={order.id} />
          </div>
        </section>
      </main>
    </div>
  );
}
