import { OrderSchema, type Order } from './types';

export interface OrdersHubResult {
  orders: Order[];
  invalidOrderCount: number;
}

/**
 * O hub e um painel agregado: um snapshot historico inconsistente nao deve
 * impedir a loja de acessar todos os outros pedidos. A validacao continua
 * sendo feita pedido a pedido; registros invalidos ficam fora apenas desta
 * listagem e sao contabilizados para a interface avisar sobre a carga parcial.
 */
export function parseOrdersForHub(payload: unknown[]): OrdersHubResult {
  const orders: Order[] = [];
  let invalidOrderCount = 0;

  for (const candidate of payload) {
    const parsed = OrderSchema.safeParse(candidate);
    if (parsed.success) orders.push(parsed.data);
    else invalidOrderCount += 1;
  }

  return { orders, invalidOrderCount };
}
