import { Barcode, CreditCard, QrCode, Wallet } from 'lucide-react';
import type { PaymentChargeMethod } from '@/domain/payments/types';

// Mapas compartilhados entre ChargeRow (OrderPaymentDetails.tsx) e o
// indicador de método/provider no resumo do pedido (PaymentMethodIndicator.tsx)
// -- um método ou provider novo só precisa de uma entrada aqui.

export const METHOD_ICONS: Record<PaymentChargeMethod, typeof CreditCard> = {
  cartao: CreditCard,
  pix: QrCode,
  boleto: Barcode,
};

// Ícone genérico pra método que a UI ainda não conhece -- nunca deixa a
// cobrança sem ícone nenhum.
export const FALLBACK_METHOD_ICON = Wallet;

export function methodIcon(method: string): typeof CreditCard {
  return METHOD_ICONS[method as PaymentChargeMethod] ?? FALLBACK_METHOD_ICON;
}

const PROVIDER_LABELS: Record<string, string> = {
  stripe: 'Stripe',
};

// Provider sem entrada no mapa (gateway novo) cai num label capitalizado a
// partir do próprio identificador, em vez de sumir da UI.
export function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? (provider.charAt(0).toUpperCase() + provider.slice(1));
}
