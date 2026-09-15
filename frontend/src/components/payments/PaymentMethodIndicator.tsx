'use client';

import { useEffect, useState } from 'react';
import { fetchOrderPaymentCharges } from '@/lib/ordersClient';
import { methodIcon, providerLabel } from './paymentMethodMeta';
import { providerIcon } from './providerIcons';
import type { OrderPaymentCharge } from '@/domain/payments/types';

// Ícone do método (Pix/cartão/boleto) + nome do provider (Stripe hoje, outro
// gateway amanhã -- ver paymentMethodMeta.ts) ao lado do status de
// pagamento no resumo do pedido. Só cobranças de gateway real têm esse
// dado; pedido marcado pago manualmente não tem charge, então o indicador
// simplesmente não renderiza nada nesse caso.
function pickChargeToShow(charges: OrderPaymentCharge[]): OrderPaymentCharge | null {
  return charges.find((c) => c.status === 'paid') ?? charges[charges.length - 1] ?? null;
}

export default function PaymentMethodIndicator({ orderId }: { orderId: string }) {
  const [charge, setCharge] = useState<OrderPaymentCharge | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    fetchOrderPaymentCharges(orderId)
      .then((result) => { if (active) setCharge(pickChargeToShow(result)); })
      .catch(() => { if (active) setCharge(null); });
    return () => { active = false; };
  }, [orderId]);

  if (!charge) return null;

  const Icon = methodIcon(charge.method);
  const ProviderIcon = providerIcon(charge.provider);
  const label = providerLabel(charge.provider);

  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground" title={label}>
      <Icon className="size-3.5 shrink-0 text-brand-primary" aria-hidden="true" />
      {ProviderIcon ? <ProviderIcon className="size-3.5 shrink-0" /> : label}
    </span>
  );
}
