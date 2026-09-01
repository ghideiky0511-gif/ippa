import { z } from 'zod';
import { OrderBookSchema, OrderSchema, OrderSessionSchema, type Order, type OrderBook, type OrderSession } from '@/domain/orders/types';
import { parseOrdersForHub, type OrdersHubResult } from '@/domain/orders/parseOrders';
import { adminJsonServer } from './httpServer';

export function fetchOrders(params?: { clientId?: string }): Promise<Order[]> {
  const query = params?.clientId ? `?clientId=${encodeURIComponent(params.clientId)}` : '';
  return adminJsonServer(`/api/admin/orders${query}`, z.array(OrderSchema), {}, 'Não foi possível carregar os pedidos.');
}

export async function fetchOrdersForHub(): Promise<OrdersHubResult> {
  const payload = await adminJsonServer(
    '/api/admin/orders',
    z.array(z.unknown()),
    {},
    'Não foi possível carregar os pedidos.',
  );
  return parseOrdersForHub(payload);
}

export function fetchOrder(id: string): Promise<Order> {
  return adminJsonServer(`/api/admin/orders/${encodeURIComponent(id)}`, OrderSchema, {}, 'Não foi possível carregar o pedido.');
}

export function fetchOrderSessions(): Promise<OrderSession[]> {
  return adminJsonServer('/api/sessions', z.array(OrderSessionSchema), {}, 'Não foi possível carregar os talões.');
}

export function fetchOrderBooks(status?: OrderBook['status']): Promise<OrderBook[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return adminJsonServer(`/api/order-books${query}`, z.array(OrderBookSchema), {}, 'Não foi possível carregar os talões.');
}
