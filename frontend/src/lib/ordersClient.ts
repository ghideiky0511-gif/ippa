import { z } from 'zod';
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
  type OrderFreightMethod,
  type OrderSession,
  type UpdateOrderSessionInput,
} from '@/domain/orders/types';
import { parseOrdersForHub, type OrdersHubResult } from '@/domain/orders/parseOrders';
import { OrderPaymentChargeSchema, type OrderPaymentCharge } from '@/domain/payments/types';
import { adminJson } from './http';

export function fetchOrders(params?: { clientId?: string }): Promise<Order[]> {
  const query = params?.clientId ? `?clientId=${encodeURIComponent(params.clientId)}` : '';
  return adminJson(`/api/admin/orders${query}`, OrderSchema.array(), {}, 'Não foi possível carregar os pedidos.');
}

export async function fetchOrdersForHub(): Promise<OrdersHubResult> {
  const payload = await adminJson(
    '/api/admin/orders',
    z.array(z.unknown()),
    {},
    'Não foi possível carregar os pedidos.',
  );
  return parseOrdersForHub(payload);
}

export function fetchCustomerOrder(orderNumber: number): Promise<Order> {
  return adminJson(`/api/orders/${encodeURIComponent(String(orderNumber))}`, OrderSchema, {}, 'NÃ£o foi possÃ­vel carregar o pedido.');
}

export function fetchOrderSessions(): Promise<OrderSession[]> {
  return adminJson('/api/sessions', OrderSessionSchema.array(), {}, 'Não foi possível carregar os talões.');
}

// Resync de uma sessão só — usado pelo realtime incremental do talão
// (applySessionEvent.ts) quando a cadeia causal de um evento de itens tem
// buraco (evento perdido), em vez de refazer o fetchOrderSessions() inteiro.
export function fetchOrderSession(id: string): Promise<OrderSession> {
  return adminJson(`/api/sessions/${id}`, OrderSessionSchema, {}, 'Não foi possível atualizar o pedido.');
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

export function finalizeOrderSession(id: string): Promise<Order> {
  return adminJson(`/api/sessions/${id}/finalize`, OrderSchema, {
    method: 'POST',
  }, 'Não foi possível finalizar o pedido.');
}

// Registro administrativo manual de pagamento (dinheiro, Pix direto etc.) --
// sem gateway nenhum por trás, ver comentário em orderService.markOrderPaid.
export function markOrderPaid(orderId: string, paymentMethod?: string): Promise<Order> {
  return adminJson(`/api/admin/orders/${orderId}/mark-paid`, OrderSchema, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentMethod }),
  }, 'Não foi possível marcar o pedido como pago.');
}

// Gera (ou reaproveita, se ainda válido) o token de cobrança deste pedido --
// ver orderPaymentLinkService.ts. A cliente (dona do pedido) ou alguém da
// loja pode chamar; usado pra levar pra /pagar/[token], a única tela onde a
// cobrança de verdade acontece (ver comentário em orderPaymentLinkService.ts).
export function requestOrderPaymentLink(orderId: string): Promise<{ token: string }> {
  return adminJson(`/api/orders/${orderId}/payment-link`, z.object({ token: z.string() }), {
    method: 'POST',
  }, 'Não foi possível gerar o link de pagamento.');
}

// Histórico de cobrança do pedido (redigido: sem PAN, só os dados de
// exibição já mascarados/normalizados pelo backend -- ver
// orderPaymentDetailsService.ts::toOrderPaymentCharge). Mesma checagem de
// dono do link acima, então esta mesma rota atende o workspace e a tela da
// cliente (ver OrderPaymentDetails.tsx, componente reusado nos dois).
export function fetchOrderPaymentCharges(orderId: string): Promise<OrderPaymentCharge[]> {
  return adminJson(`/api/orders/${orderId}/payment`, OrderPaymentChargeSchema.array(), {}, 'Não foi possível carregar os dados de pagamento.');
}

// Confirmação manual da separação física dos itens -- sem integração de
// fulfillment automática ainda, ver comentário em
// orderService.confirmOrderItemsSeparation. Pré-requisito pra cobrar o
// pedido (createOrderCharge exige qty_separated = qty em cada item).
export function confirmOrderSeparation(orderId: string): Promise<Order> {
  return adminJson(`/api/admin/orders/${orderId}/confirm-separation`, OrderSchema, {
    method: 'PUT',
  }, 'Não foi possível confirmar a separação dos itens.');
}

// Troca o tipo de frete (transportadora/correios/motoboy/etc.) de um pedido
// já fechado -- ver comentário em updateOrderFreightMethod (orderService.ts)
// pras regras de quando isso é permitido.
export function updateOrderFreightMethod(orderId: string, method: OrderFreightMethod): Promise<Order> {
  return adminJson(`/api/admin/orders/${orderId}/freight`, OrderSchema, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method }),
  }, 'Não foi possível alterar o frete.');
}

// pushStatus foge da validação Zod de propósito -- é o mesmo ProviderOrderRow
// "cru" (ERP) que fetchOrderPushStatus/requestOrderPushResend já devolvem sem
// validar (ver erpIntegrationClient.ts), só repassado aqui pra sincronizar o
// estado de envio ao ERP direto da resposta do cancelamento, sem round-trip.
const CancelOrderResultSchema = z.object({ order: OrderSchema, erpWarning: z.string().optional(), pushStatus: z.unknown().nullable().optional() });

export function cancelOrder(orderId: string): Promise<{ order: Order; erpWarning?: string; pushStatus?: unknown }> {
  return adminJson(`/api/admin/orders/${orderId}/cancel`, CancelOrderResultSchema, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  }, 'Não foi possível cancelar o pedido.');
}
