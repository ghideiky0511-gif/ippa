import type { Order } from '@/domain/orders/types';
import { StatusChip, type StatusChipTone } from '@/components/StatusChip';

export const ORDER_STATUS_LABELS: Record<Order['status'], string> = {
  aberto: 'Em montagem',
  aguardando_pagamento: 'Aguardando pagamento',
  novo: 'Aguardando separação',
  separado: 'Separado',
  pago: 'Pago',
  cancelado: 'Cancelado',
};

const ORDER_STATUS_TONES: Record<Order['status'], StatusChipTone> = {
  aberto: 'neutral',
  aguardando_pagamento: 'neutral',
  novo: 'neutral',
  separado: 'brand',
  pago: 'brand',
  cancelado: 'danger',
};

export function OrderStatusChip({ status }: { status: Order['status'] }) {
  return <StatusChip label={ORDER_STATUS_LABELS[status]} tone={ORDER_STATUS_TONES[status]} />;
}
