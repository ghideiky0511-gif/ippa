import { DeliveryQuoteSchema, OrderSessionSchema, type DeliveryQuote, type OrderSession } from '@/domain/orders/types';
import { adminJson } from './http';

// Gera (e persiste) uma cotação por freight_provider ativo do tenant pra
// esta sessão -- substitui o MOCK_SHIPPING_OPTIONS antigo. CEP hoje só é
// repassado pro backend; nenhum provider ativo ainda calcula frete por
// distância (ver backend/src/services/orders/freightPricing.ts).
export function fetchDeliveryQuotes(sessionId: string, cep?: string): Promise<DeliveryQuote[]> {
  const query = cep ? `?cep=${encodeURIComponent(cep)}` : '';
  return adminJson(
    `/api/sessions/${sessionId}/delivery-quotes${query}`,
    DeliveryQuoteSchema.array(),
    {},
    'Não foi possível calcular o frete.',
  );
}

// Escolhe uma cotação gerada por fetchFreightQuotes -- só assim uma sessão
// passa a ter frete (PUT /sessions/:id não aceita mais esse campo).
export function selectDeliveryQuote(sessionId: string, quoteId: string): Promise<OrderSession> {
  return adminJson(`/api/sessions/${sessionId}/delivery-quotes`, OrderSessionSchema, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quoteId }),
  }, 'Não foi possível escolher o frete.');
}

// Checkout direto (cliente sem talão/sessão ativa) não passa por sessão --
// lista os providers ativos já convertidos pra preço/label/prazo.
export function fetchDeliveryOptions(): Promise<DeliveryQuote[]> {
  return adminJson('/api/delivery-options', DeliveryQuoteSchema.array(), {}, 'Não foi possível carregar as opções de entrega.');
}

// Aliases temporários para componentes/clientes que ainda não migraram.
export const fetchFreightQuotes = fetchDeliveryQuotes;
export const selectFreightQuote = selectDeliveryQuote;
export const fetchFreightProviders = fetchDeliveryOptions;
