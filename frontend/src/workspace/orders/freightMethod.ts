import type { OrderFreightMethod } from '@/domain/orders/types';

export const ORDER_FREIGHT_METHOD_LABELS: Record<OrderFreightMethod, string> = {
  transportadora: 'Transportadora',
  correios: 'Correios',
  excursao: 'Excursão',
  loja_vizinha: 'Loja vizinha',
  retirada_local: 'Retirada local',
  motoboy: 'Motoboy',
  entrega_propria: 'Entrega própria',
};
