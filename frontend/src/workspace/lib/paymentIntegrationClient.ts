import { z } from 'zod';
import { adminJson } from './http';

export interface PaymentProviderCredentialField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'number' | 'number-list';
  required: boolean;
}

export interface PaymentIntegrationOption {
  provider: string;
  label: string;
  description: string;
  logoPath?: string;
  credentialFields: PaymentProviderCredentialField[];
  configured: boolean;
  active: boolean;
  updatedAt: string | null;
}

export interface PaymentIntegrationTestResult {
  ok: boolean;
  message?: string;
}

// Pagamento fica fora do escopo da validação Zod na fronteira da API (mesmo
// tradeoff aceito para ERP, ver erpIntegrationClient.ts) -- z.unknown() só
// preserva o comportamento de não validar a resposta.
const unknown = z.unknown();

export function fetchPaymentIntegrations(): Promise<{ options: PaymentIntegrationOption[] }> {
  return adminJson('/api/payment-integration', unknown, {}, 'Não foi possível carregar os provedores de pagamento.') as Promise<{ options: PaymentIntegrationOption[] }>;
}

export function savePaymentIntegrationCredentials(
  provider: string,
  credentials: Record<string, string>
): Promise<PaymentIntegrationOption> {
  return adminJson(
    '/api/payment-integration',
    unknown,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, credentials }),
    },
    'Não foi possível salvar as credenciais.'
  ) as Promise<PaymentIntegrationOption>;
}

// Sem `credentials`, testa o que já está salvo para o provider; com
// `credentials`, testa o rascunho sem salvar nada.
export function testPaymentIntegrationConnection(
  provider: string,
  credentials?: Record<string, string>
): Promise<PaymentIntegrationTestResult> {
  return adminJson(
    '/api/payment-integration/test',
    unknown,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, credentials }),
    },
    'Não foi possível testar a conexão.'
  ) as Promise<PaymentIntegrationTestResult>;
}

export function activatePaymentIntegration(provider: string): Promise<PaymentIntegrationOption> {
  return adminJson(
    '/api/payment-integration/activate',
    unknown,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    },
    'Não foi possível ativar o provedor.'
  ) as Promise<PaymentIntegrationOption>;
}

export function deactivatePaymentIntegration(): Promise<{ deactivated: boolean }> {
  return adminJson('/api/payment-integration/deactivate', unknown, { method: 'POST' }, 'Não foi possível desativar o provedor.') as Promise<{ deactivated: boolean }>;
}
