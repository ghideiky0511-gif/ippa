import { z } from 'zod';
import { OrderBookSchema, OrderSchema, OrderSessionSchema, type Order, type OrderBook, type OrderSession } from '@/domain/orders/types';
import { adminJsonServer } from './httpServer';

export function fetchOrders(): Promise<Order[]> {
  return adminJsonServer('/api/admin/orders', z.array(OrderSchema), {}, 'Não foi possível carregar os pedidos.');
}

export function fetchOrderSessions(): Promise<OrderSession[]> {
  return adminJsonServer('/api/sessions', z.array(OrderSessionSchema), {}, 'Não foi possível carregar os talões.');
}

export function fetchOrderBooks(status?: OrderBook['status']): Promise<OrderBook[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return adminJsonServer(`/api/order-books${query}`, z.array(OrderBookSchema), {}, 'Não foi possível carregar os talões.');
}
