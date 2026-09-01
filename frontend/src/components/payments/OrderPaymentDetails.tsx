'use client';

import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusChip, type StatusChipTone } from '@/components/StatusChip';
import { fetchOrderPaymentCharges } from '@/lib/ordersClient';
import { formatBRL } from '@/lib/format';
import { methodIcon } from './paymentMethodMeta';
import type { OrderPaymentCharge, PaymentChargeStatus } from '@/domain/payments/types';

// Componente único de exibição de cobrança -- reusado tal e qual no
// workspace (OrderDetailApp.tsx) e na tela da cliente (/pedidos/[orderNumber]).
// Não conhece Stripe: o backend já resolve provider -> campos de exibição
// (ver contracts/payments.ts, orderPaymentDetailsService.ts) antes de
// chegar aqui, então um gateway novo não muda uma linha deste arquivo.

const STATUS_LABELS: Record<PaymentChargeStatus, string> = {
  pending: 'Pendente',
  processing: 'Processando',
  authorized: 'Autorizado',
  paid: 'Pago',
  failed: 'Falhou',
  expired: 'Expirado',
  cancelled: 'Cancelado',
};

const STATUS_TONES: Record<PaymentChargeStatus, StatusChipTone> = {
  pending: 'neutral',
  processing: 'neutral',
  authorized: 'brand',
  paid: 'brand',
  failed: 'danger',
  expired: 'danger',
  cancelled: 'neutral',
};

function maskCardNumber(lastDigits?: string): string {
  return lastDigits ? `•••• •••• •••• ${lastDigits}` : '•••• •••• •••• ••••';
}

function ChargeRow({ charge }: { charge: OrderPaymentCharge }) {
  const Icon = methodIcon(charge.method);
  const card = charge.card;
  return (
    <div className="flex flex-col gap-3 border-b border-border py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0 text-brand-primary" aria-hidden="true" />
        <div>
          <p className="font-semibold text-foreground">
            {card ? `${card.brand ? `${card.brand.toUpperCase()} · ` : ''}${maskCardNumber(card.lastDigits)}` : 'Cobrança'}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {new Date(charge.createdAt).toLocaleString('pt-BR')}
            {card ? ` · ${card.installments}x` : ''}
          </p>
          {card?.nsu && <p className="mt-0.5 text-xs text-muted-foreground">NSU {card.nsu}</p>}
          {charge.failureReason && <p className="mt-1 text-sm text-[#b00020]">{charge.failureReason}</p>}
        </div>
      </div>
      <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1.5">
        <StatusChip label={STATUS_LABELS[charge.status]} tone={STATUS_TONES[charge.status]} />
        <p className="font-bold text-foreground">{formatBRL(charge.amount)}</p>
      </div>
    </div>
  );
}

// Sem card/section próprios de propósito -- workspace e tela da cliente têm
// convenções de moldura diferentes (ver OrderDetailApp.tsx vs. Card em
// pedidos/[orderNumber]/page.tsx); cada host escolhe a própria.
export default function OrderPaymentDetails({ orderId }: { orderId: string }) {
  const [charges, setCharges] = useState<OrderPaymentCharge[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetchOrderPaymentCharges(orderId)
      .then((result) => { if (active) { setCharges(result); setError(''); } })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : 'Não foi possível carregar os dados de pagamento.'); });
    return () => { active = false; };
  }, [orderId]);

  if (error) return <p className="text-sm text-[#b00020]">{error}</p>;
  if (!charges) return <Skeleton className="h-16 w-full rounded-brand" />;
  if (charges.length === 0) return <p className="text-sm text-muted-foreground">Nenhuma cobrança registrada para este pedido ainda.</p>;

  return (
    <div>
      {charges.map((charge) => <ChargeRow key={charge.id} charge={charge} />)}
    </div>
  );
}
