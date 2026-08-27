'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, PackageCheck, ReceiptText, ShoppingBag } from 'lucide-react';
import Link from '@/components/TenantLink';
import ProductImage from '@/components/ProductImage';
import { useAuthUser } from '@/components/AuthProvider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import type { Order } from '@/domain/orders/types';
import { formatBRL } from '@/lib/format';
import { fetchCustomerOrder } from '@/lib/ordersClient';
import { publicUi } from '@/lib/ui';

const STATUS_LABELS: Record<Order['status'], string> = {
  aberto: 'Em montagem',
  aguardando_pagamento: 'Aguardando pagamento',
  novo: 'Aguardando separação',
  separado: 'Separado',
  pago: 'Pago',
  cancelado: 'Cancelado',
};

const CHANNEL_LABELS: Record<Order['channel'], string> = {
  online: 'Site',
  presencial: 'Presencial',
  whatsapp: 'WhatsApp',
};

const PAYMENT_METHODS = [
  { id: 'pix', label: 'Pix' },
  { id: 'cartao', label: 'Cartão de crédito' },
  { id: 'boleto', label: 'Boleto' },
];

function OrderDetailSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-36 w-full rounded-brand" />
      <Skeleton className="h-64 w-full rounded-brand" />
    </div>
  );
}

export default function PedidoDetalhePage() {
  const { authUser } = useAuthUser();
  const { orderNumber: rawOrderNumber } = useParams<{ orderNumber: string }>();
  const orderNumber = /^[1-9]\d*$/.test(rawOrderNumber || '') ? Number(rawOrderNumber) : NaN;
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

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
        <h1 className="mb-5 text-2xl font-bold tracking-[-0.03em] text-foreground sm:text-3xl">Detalhes do pedido</h1>
        <EmptyState
          title="Acesse seu pedido"
          description="Entre na sua conta para conferir este pedido."
          icon={<ShoppingBag className="size-7" aria-hidden="true" />}
          action={<Button asChild><Link href={`/login?redirect=${encodeURIComponent(`/pedidos/${rawOrderNumber || ''}`)}`}>Entrar</Link></Button>}
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
        <Link href="/pedidos"><ArrowLeft className="size-4" aria-hidden="true" />Meus pedidos</Link>
      </Button>

      {loading || !order ? <OrderDetailSkeleton /> : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Pedido nº {order.orderNumber}</p>
              <h1 className="mt-1 text-2xl font-bold tracking-[-0.03em] text-foreground sm:text-3xl">Detalhes do pedido</h1>
            </div>
            <Badge>{STATUS_LABELS[order.status]}</Badge>
          </div>

          <Card className="p-4">
            <div className="flex items-start gap-3">
              <ReceiptText className="mt-0.5 size-5 shrink-0 text-brand-primary" aria-hidden="true" />
              <div className="grid flex-1 gap-3 text-sm sm:grid-cols-2">
                <div><p className="text-muted-foreground">Data</p><p className="mt-0.5 font-semibold text-foreground">{new Date(order.date).toLocaleString('pt-BR')}</p></div>
                <div><p className="text-muted-foreground">Canal</p><p className="mt-0.5 font-semibold text-foreground">{CHANNEL_LABELS[order.channel]}</p></div>
                {order.paymentMethod && <div><p className="text-muted-foreground">Pagamento</p><p className="mt-0.5 font-semibold text-foreground">{order.paymentMethod}</p></div>}
                {order.shipping && <div><p className="text-muted-foreground">Frete</p><p className="mt-0.5 font-semibold text-foreground">{order.shipping.label} · {formatBRL(order.shipping.price)}</p></div>}
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="font-bold text-foreground">Itens do pedido</h2>
            <div className="mt-3 flex flex-col divide-y divide-border">
              {order.items.map((item) => (
                <div className="flex gap-3 py-3 first:pt-0 last:pb-0" key={item.key}>
                  <ProductImage src={item.image} alt={item.name} className="h-24 w-16 shrink-0 rounded-control bg-brand-background" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">{item.name}</p>
                    {(item.color || item.size) && <p className="mt-0.5 text-sm text-muted-foreground">{[item.color, item.size].filter(Boolean).join(' · ')}</p>}
                    <p className="mt-2 text-sm text-muted-foreground">{item.qty} × {formatBRL(item.price)}</p>
                  </div>
                  <p className="shrink-0 text-sm font-bold text-foreground">{formatBRL(item.qty * item.price)}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between text-muted-foreground"><span>Produtos</span><span>{formatBRL(order.items.reduce((sum, item) => sum + item.qty * item.price, 0))}</span></div>
              {order.discount && <div className="flex justify-between text-muted-foreground"><span>Desconto · {order.discount.label}</span><span>-{formatBRL(order.discount.amount)}</span></div>}
              {order.shipping && <div className="flex justify-between text-muted-foreground"><span>Frete</span><span>{formatBRL(order.shipping.price)}</span></div>}
              <div className="flex justify-between border-t border-border pt-3 text-base font-bold text-foreground"><span>Total</span><span>{formatBRL(order.total)}</span></div>
            </div>
          </Card>

          {order.status === 'separado' && (
            <Card className="p-4">
              <h2 className="font-bold text-foreground">Pagamento</h2>
              <div className={`${publicUi.paymentOptions} mt-3`}>
                {PAYMENT_METHODS.map((method) => (
                  <label key={method.id} className={`${publicUi.paymentOption} opacity-50`}>
                    <input type="radio" name="payment" disabled />
                    {method.label} <span className="text-xs">(em breve)</span>
                  </label>
                ))}
              </div>
              <p className="mt-3 text-sm text-muted-foreground">Pagamento pelo site em breve — a loja entra em contato para combinar o pagamento.</p>
            </Card>
          )}
        </div>
      )}
    </main>
  );
}
