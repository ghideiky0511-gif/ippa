import { createElement } from 'react';
import { Barcode, CreditCard, QrCode, Wallet, type LucideProps } from 'lucide-react';
import type { PaymentChargeMethod } from '@/domain/payments/types';

// Mapas compartilhados entre ChargeRow (OrderPaymentDetails.tsx) e o
// indicador de método/provider no resumo do pedido (PaymentMethodIndicator.tsx)
// -- um método ou provider novo só precisa de uma entrada aqui.

export function PaymentMethodIcon({ method, ...props }: { method: string } & LucideProps) {
  switch (method as PaymentChargeMethod) {
    case 'cartao': return createElement(CreditCard, props);
    case 'pix': return createElement(QrCode, props);
    case 'boleto': return createElement(Barcode, props);
    // Ícone genérico pra método que a UI ainda não conhece -- nunca deixa a
    // cobrança sem ícone nenhum.
    default: return createElement(Wallet, props);
  }
}

const PROVIDER_LABELS: Record<string, string> = {
  stripe: 'Stripe',
  mercadopago: 'Mercado Pago',
};

// Provider sem entrada no mapa (gateway novo) cai num label capitalizado a
// partir do próprio identificador, em vez de sumir da UI.
export function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? (provider.charAt(0).toUpperCase() + provider.slice(1));
}
