'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, PackageCheck, ShoppingBag } from 'lucide-react';
import Link from '@/components/TenantLink';
import { useAuthUser } from '@/components/AuthProvider';
import { useTenant } from '@/components/TenantProvider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusChip, type StatusChipTone } from '@/components/StatusChip';
import PaymentMethodIndicator from '@/components/payments/PaymentMethodIndicator';
import OrderPaymentDetails from '@/components/payments/OrderPaymentDetails';
import type { Order } from '@/domain/orders/types';
import { fetchCustomerOrder, requestOrderPaymentLink } from '@/lib/ordersClient';
import { publicUi } from '@/lib/ui';

// Mesmo padrão de rótulo/tom do resumo em [orderNumber]/page.tsx e do
// workspace (OrderDetailApp.tsx) -- ver PAYMENT_STATUS_LABELS lá.
const PAYMENT_STATUS_LABELS: Record<NonNullable<Order['paymentStatus']>, string> = {
  unpaid: 'Não cobrado',
  awaiting_confirmation: 'Aguardando confirmação',
  paid: 'Pago',
  payment_failed: 'Falhou',
};

const PAYMENT_STATUS_TONES: Record<NonNullable<Order['paymentStatus']>, StatusChipTone> = {
  unpaid: 'neutral',
  awaiting_confirmation: 'neutral',
  paid: 'brand',
  payment_failed: 'danger',
};

function PaymentPageSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-24 w-full rounded-brand" />
      <Skeleton className="h-48 w-full rounded-brand" />
    </div>
  );
}

export default function PedidoPagamentoPage() {
  const { authUser } = useAuthUser();
  const { href } = useTenant();
  const router = useRouter();
  const { orderNumber: rawOrderNumber } = useParams<{ orderNumber: string }>();
  const orderNumber = /^[1-9]\d*$/.test(rawOrderNumber || '') ? Number(rawOrderNumber) : NaN;
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [payingNow, setPayingNow] = useState(false);

  async function payNow() {
    if (!order) return;
    setPayingNow(true);
    try {
      const { token } = await requestOrderPaymentLink(order.id);
      router.push(href(`/pagar/${token}`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível abrir o pagamento.');
      setPayingNow(false);
    }
  }

  useEffect(() => {
    if (!authUser || !Number.isSafeInteger(orderNumber)) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setNotFound(false);
    void fetchCustomerOrder(orderNumber)
      .then((nextOrder) => {
        if (active) setOrder(nextOrder);
      })
      .catch(() => {
        if (active) setNotFound(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [authUser, orderNumber]);

  if (!authUser) {
    return (
      <main className={`${publicUi.container} py-8 sm:py-10`}>
        <h1 className="mb-5 text-2xl font-bold tracking-[-0.03em] text-foreground sm:text-3xl">Pagamento do pedido</h1>
        <EmptyState
          title="Acesse seu pedido"
          description="Entre na sua conta para conferir o pagamento deste pedido."
          icon={<ShoppingBag className="size-7" aria-hidden="true" />}
          action={<Button asChild><Link href={`/login?redirect=${encodeURIComponent(`/pedidos/${rawOrderNumber || ''}/pagamento`)}`}>Entrar</Link></Button>}
        />
      </main>
    );
  }

  if (!Number.isSafeInteger(orderNumber) || notFound) {
    return (
      <main className={`${publicUi.container} py-8 sm:py-10`}>
        <EmptyState
          title="Pedido não encontrado"
          description="Confira o link recebido ou consulte a lista dos seus pedidos."
          icon={<PackageCheck className="size-7" aria-hidden="true" />}
          action={<Button asChild variant="outline"><Link href="/pedidos">Ver meus pedidos</Link></Button>}
        />
      </main>
    );
  }

  return (
    <main className={`${publicUi.container} py-8 pb-14 sm:py-10`}>
      <Button asChild variant="ghost" size="sm" className="mb-5">
        <Link href={`/pedidos/${rawOrderNumber}`}><ArrowLeft className="size-4" aria-hidden="true" />Voltar ao pedido</Link>
      </Button>

      {loading || !order ? <PaymentPageSkeleton /> : (
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Pedido nº {order.orderNumber}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-[-0.03em] text-foreground sm:text-3xl">Pagamento</h1>
          </div>

          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip
                label={PAYMENT_STATUS_LABELS[order.paymentStatus ?? 'unpaid']}
                tone={PAYMENT_STATUS_TONES[order.paymentStatus ?? 'unpaid']}
              />
              <PaymentMethodIndicator orderId={order.id} />
            </div>
            {order.paymentStatus === 'paid' && (
              <p className="mt-2 text-sm text-muted-foreground">
                Pagamento confirmado{order.paidAt ? ` em ${new Date(order.paidAt).toLocaleString('pt-BR')}` : ''}.
              </p>
            )}
            {order.status === 'separado' && order.paymentStatus !== 'paid' && (
              <>
                <p className="mt-2 text-sm text-muted-foreground">Suas peças já foram separadas — falta só pagar com cartão de crédito.</p>
                <Button className="mt-3" onClick={() => void payNow()} disabled={payingNow}>
                  {payingNow ? 'Abrindo...' : 'Pagar agora'}
                </Button>
              </>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="font-bold text-foreground">Cobranças</h2>
            <p className="mt-1 text-sm text-muted-foreground">Histórico de tentativas de cobrança deste pedido.</p>
            <div className="mt-3">
              <OrderPaymentDetails orderId={order.id} />
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}
