import type { Order } from '@/domain/orders/types';
import { adminJson } from './http';

export function fetchOrders(): Promise<Order[]> {
  return adminJson('/api/admin/orders', {}, 'Não foi possível carregar os pedidos.');
}
