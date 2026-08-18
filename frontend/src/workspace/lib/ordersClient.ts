import type { Client } from '@/domain/clients/types';
import type { Order, OrderBook, OrderSession } from '@/domain/orders/types';
import { adminJson } from './http';

export function fetchOrders(): Promise<Order[]> {
  return adminJson('/api/admin/orders', {}, 'Não foi possível carregar os pedidos.');
}

export function fetchOrderSessions(): Promise<OrderSession[]> {
  return adminJson('/api/sessions', {}, 'Não foi possível carregar os talões.');
}

export function fetchOrderBooks(): Promise<OrderBook[]> {
  return adminJson('/api/order-books', {}, 'Não foi possível carregar os talões.');
}

export function fetchActiveOrderBook(): Promise<OrderBook> {
  return adminJson('/api/order-books/active', { method: 'POST' }, 'Não foi possível preparar o talão atual.');
}

export function createOrderBook(name: string): Promise<OrderBook> {
  return adminJson('/api/order-books', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
  }, 'Não foi possível criar o talão.');
}

export function activateOrderBook(id: string): Promise<OrderBook> {
  return adminJson(`/api/order-books/${id}/activate`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
  }, 'Não foi possível trocar o talão ativo.');
}

export function searchOrderClients(query: string): Promise<Client[]> {
  return adminJson(`/api/clients?q=${encodeURIComponent(query)}`, {}, 'Não foi possível buscar a cliente.');
}

export function createOrderSession(body: Partial<OrderSession>): Promise<OrderSession> {
  return adminJson('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, 'Não foi possível criar o talão.');
}

export function updateOrderSession(id: string, body: Partial<OrderSession>): Promise<OrderSession> {
  return adminJson(`/api/sessions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, 'Não foi possível atualizar o talão.');
}

export function finalizeOrderSession(id: string, paymentMethod?: string): Promise<Order> {
  return adminJson(`/api/sessions/${id}/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentMethod }),
  }, 'Não foi possível finalizar o pedido.');
}
