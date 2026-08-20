import type { Order, OrderBook, OrderSession } from '@/domain/orders/types';
import { adminJsonServer } from './httpServer';

export function fetchOrders(): Promise<Order[]> {
  return adminJsonServer('/api/admin/orders', {}, 'Não foi possível carregar os pedidos.');
}

export function fetchOrderSessions(): Promise<OrderSession[]> {
  return adminJsonServer('/api/sessions', {}, 'Não foi possível carregar os talões.');
}

export function fetchOrderBooks(status?: OrderBook['status']): Promise<OrderBook[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return adminJsonServer(`/api/order-books${query}`, {}, 'Não foi possível carregar os talões.');
}
