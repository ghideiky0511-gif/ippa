import {
  ClientLookupResultSchema,
  ClientSchema,
  type Client,
  type ClientLookupResult,
} from '@/domain/clients/types';
import {
  CreateOrderSessionInputSchema,
  OrderBookSchema,
  OrderSchema,
  OrderSessionSchema,
  UpdateOrderSessionInputSchema,
  type CreateOrderSessionInput,
  type Order,
  type OrderBook,
  type OrderSession,
  type UpdateOrderSessionInput,
} from '@/domain/orders/types';
import { adminJson } from './http';

export function fetchOrders(params?: { clientId?: string }): Promise<Order[]> {
  const query = params?.clientId ? `?clientId=${encodeURIComponent(params.clientId)}` : '';
  return adminJson(`/api/admin/orders${query}`, OrderSchema.array(), {}, 'Não foi possível carregar os pedidos.');
}

export function fetchOrderSessions(): Promise<OrderSession[]> {
  return adminJson('/api/sessions', OrderSessionSchema.array(), {}, 'Não foi possível carregar os talões.');
}

export function fetchOrderBooks(status?: OrderBook['status']): Promise<OrderBook[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return adminJson(`/api/order-books${query}`, OrderBookSchema.array(), {}, 'Não foi possível carregar os talões.');
}

export function fetchActiveOrderBook(): Promise<OrderBook> {
  return adminJson('/api/order-books/active', OrderBookSchema, { method: 'POST' }, 'Não foi possível preparar o talão atual.');
}

export function createOrderBook(name: string): Promise<OrderBook> {
  return adminJson('/api/order-books', OrderBookSchema, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
  }, 'Não foi possível criar o talão.');
}

export function activateOrderBook(id: string): Promise<OrderBook> {
  return adminJson(`/api/order-books/${id}/activate`, OrderBookSchema, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
  }, 'Não foi possível trocar o talão ativo.');
}

export function cancelOrderBook(id: string): Promise<OrderBook> {
  return adminJson(`/api/order-books/${id}/cancel`, OrderBookSchema, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
  }, 'Não foi possível cancelar o talão.');
}

export function searchOrderClients(query: string): Promise<Client[]> {
  return adminJson(`/api/clients?q=${encodeURIComponent(query)}`, ClientSchema.array(), {}, 'Não foi possível buscar a cliente.');
}

// Busca por CPF/CNPJ exato: cadastro local do tenant tem prioridade; se não
// existir, o backend tenta importar do ERP ativo antes de responder
// "not_found" (ver services/clients/clientService.ts:findOrImportTenantClientByDocument).
export function lookupOrderClientByDocument(document: string): Promise<ClientLookupResult> {
  return adminJson(`/api/clients/lookup?document=${encodeURIComponent(document)}`, ClientLookupResultSchema, {}, 'Não foi possível buscar a cliente pelo documento.');
}

export function createOrderSession(body: CreateOrderSessionInput): Promise<OrderSession> {
  const payload = CreateOrderSessionInputSchema.parse(body);
  return adminJson('/api/sessions', OrderSessionSchema, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, 'Não foi possível criar o talão.');
}

export function updateOrderSession(id: string, body: UpdateOrderSessionInput): Promise<OrderSession> {
  const payload = UpdateOrderSessionInputSchema.parse(body);
  return adminJson(`/api/sessions/${id}`, OrderSessionSchema, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, 'Não foi possível atualizar o talão.');
}

export function finalizeOrderSession(id: string, paymentMethod?: string): Promise<Order> {
  return adminJson(`/api/sessions/${id}/finalize`, OrderSchema, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentMethod }),
  }, 'Não foi possível finalizar o pedido.');
}
