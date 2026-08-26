import { z } from 'zod';
import { adminJsonServer } from './httpServer';
import type { ErpIntegrationOption, ProviderOrderAttempt, ProviderOrderRow } from './erpIntegrationClient';

// ERP fica fora do escopo da validação Zod na fronteira da API — z.unknown()
// só preserva o comportamento de hoje (sem validar a resposta) pra
// continuar compilando com a nova assinatura de adminJsonServer.
export function fetchErpIntegrations(): Promise<{ options: ErpIntegrationOption[] }> {
  return adminJsonServer('/api/erp-integration', z.unknown(), {}, 'Não foi possível carregar os provedores de ERP.') as Promise<{ options: ErpIntegrationOption[] }>;
}

export function fetchOrderPushStatus(orderId: string): Promise<ProviderOrderRow | null> {
  return adminJsonServer(
    `/api/erp-integration/order-push?orderId=${encodeURIComponent(orderId)}`,
    z.unknown(),
    {},
    'Não foi possível carregar o status de envio ao ERP.'
  ) as Promise<ProviderOrderRow | null>;
}

export function fetchOrderPushHistory(orderId: string): Promise<ProviderOrderAttempt[]> {
  return adminJsonServer(
    `/api/erp-integration/order-push/history?orderId=${encodeURIComponent(orderId)}`,
    z.unknown(),
    {},
    'Não foi possível carregar o histórico de envio ao ERP.'
  ) as Promise<ProviderOrderAttempt[]>;
}
