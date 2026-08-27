import { z } from 'zod';
import { adminJson } from './http';

export interface ErpProviderCredentialField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'number' | 'number-list';
  required: boolean;
}

export interface ErpIntegrationOption {
  provider: string;
  label: string;
  description: string;
  logoPath?: string;
  credentialFields: ErpProviderCredentialField[];
  configured: boolean;
  active: boolean;
  updatedAt: string | null;
  credentials: Record<string, unknown>;
}

export interface ErpIntegrationTestResult {
  ok: boolean;
  message?: string;
}

export interface TotvsClassificationTypeOption {
  typeCode: string; typeName: string; typeNameAux?: string; itemCount: number; sampleNames: string[]; categoryLevel?: 1 | 2 | 3;
}
export interface TotvsClassificationCatalog {
  types: TotvsClassificationTypeOption[];
  mapping?: { level1TypeCode: string; level2TypeCode?: string; level3TypeCode?: string };
}

export function fetchTotvsClassificationCatalog(): Promise<TotvsClassificationCatalog> {
  return adminJson('/api/erp-integration/totvsmoda/classifications', unknown, {}, 'Não foi possível carregar os tipos da TOTVS.') as Promise<TotvsClassificationCatalog>;
}

export function saveTotvsClassificationMapping(mapping: TotvsClassificationCatalog['mapping']): Promise<TotvsClassificationCatalog> {
  return adminJson('/api/erp-integration/totvsmoda/category-hierarchy', unknown, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mapping),
  }, 'Não foi possível salvar o mapeamento de categorias.') as Promise<TotvsClassificationCatalog>;
}

export type ProviderOrderStatus = 'pending' | 'processing' | 'cancelling' | 'sent' | 'failed' | 'cancelled';

// Estado ATUAL do envio de um pedido ao ERP (provider_orders) -- no máximo
// uma linha por pedido, sobrescrita a cada tentativa. Ver ProviderOrderAttempt
// para o histórico de tentativas.
export interface ProviderOrderRow {
  id: string;
  integration_id: string;
  order_id: string;
  provider: string;
  external_id: string | null;
  status: ProviderOrderStatus;
  attempts: number;
  next_attempt_at: string;
  payload: Record<string, unknown>;
  response: Record<string, unknown>;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export type ProviderOrderAttemptOutcome = 'sent' | 'failed' | 'retry_pending' | 'retry_cancelling';

// Uma linha por tentativa de dispatch (provider_order_attempts) -- log
// append-only, diferente de ProviderOrderRow (estado atual).
export interface ProviderOrderAttempt {
  id: string;
  provider_order_id: string;
  order_id: string;
  provider: string;
  attempt_number: number;
  outcome: ProviderOrderAttemptOutcome;
  external_id: string | null;
  error: string | null;
  payload: Record<string, unknown>;
  response: Record<string, unknown>;
  created_at: string;
}

// ERP fica fora do escopo da validação Zod na fronteira da API — z.unknown()
// só preserva o comportamento de hoje (sem validar a resposta) pra
// continuar compilando com a nova assinatura de adminJson.
const unknown = z.unknown();

export function fetchErpIntegrations(): Promise<{ options: ErpIntegrationOption[] }> {
  return adminJson('/api/erp-integration', unknown, {}, 'Não foi possível carregar os provedores de ERP.') as Promise<{ options: ErpIntegrationOption[] }>;
}

export function saveErpIntegrationCredentials(
  provider: string,
  credentials: Record<string, string>
): Promise<ErpIntegrationOption> {
  return adminJson(
    '/api/erp-integration',
    unknown,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, credentials }),
    },
    'Não foi possível salvar as credenciais.'
  ) as Promise<ErpIntegrationOption>;
}

// Sem `credentials`, testa o que já está salvo para o provider; com
// `credentials`, testa o rascunho sem salvar nada.
export function testErpIntegrationConnection(
  provider: string,
  credentials?: Record<string, string>
): Promise<ErpIntegrationTestResult> {
  return adminJson(
    '/api/erp-integration/test',
    unknown,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, credentials }),
    },
    'Não foi possível testar a conexão.'
  ) as Promise<ErpIntegrationTestResult>;
}

export function activateErpIntegration(provider: string): Promise<ErpIntegrationOption> {
  return adminJson(
    '/api/erp-integration/activate',
    unknown,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    },
    'Não foi possível ativar o provedor.'
  ) as Promise<ErpIntegrationOption>;
}

export function deactivateErpIntegration(): Promise<{ deactivated: boolean }> {
  return adminJson('/api/erp-integration/deactivate', unknown, { method: 'POST' }, 'Não foi possível desativar o provedor.') as Promise<{ deactivated: boolean }>;
}

export function fetchOrderPushStatus(orderId: string): Promise<ProviderOrderRow | null> {
  return adminJson(
    `/api/erp-integration/order-push?orderId=${encodeURIComponent(orderId)}`,
    unknown,
    {},
    'Não foi possível carregar o status de envio ao ERP.'
  ) as Promise<ProviderOrderRow | null>;
}

export function fetchOrderPushHistory(orderId: string): Promise<ProviderOrderAttempt[]> {
  return adminJson(
    `/api/erp-integration/order-push/history?orderId=${encodeURIComponent(orderId)}`,
    unknown,
    {},
    'Não foi possível carregar o histórico de envio ao ERP.'
  ) as Promise<ProviderOrderAttempt[]>;
}

export function requestOrderPushResend(orderId: string): Promise<ProviderOrderRow | null> {
  return adminJson(
    '/api/erp-integration/order-push',
    unknown,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    },
    'Não foi possível reenviar o pedido ao ERP.'
  ) as Promise<ProviderOrderRow | null>;
}
