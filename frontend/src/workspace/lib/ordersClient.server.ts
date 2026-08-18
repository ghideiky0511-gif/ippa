import type { Order } from '@/domain/orders/types';
import { adminJsonServer } from './httpServer';

export function fetchOrders(): Promise<Order[]> {
  return adminJsonServer('/api/admin/orders', {}, 'Não foi possível carregar os pedidos.');
}
