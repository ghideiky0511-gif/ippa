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
