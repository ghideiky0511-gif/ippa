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

export function fetchErpIntegrations(): Promise<{ options: ErpIntegrationOption[] }> {
  return adminJson('/api/erp-integration', {}, 'Não foi possível carregar os provedores de ERP.');
}

export function saveErpIntegrationCredentials(
  provider: string,
  credentials: Record<string, string>
): Promise<ErpIntegrationOption> {
  return adminJson(
    '/api/erp-integration',
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, credentials }),
    },
    'Não foi possível salvar as credenciais.'
  );
}

// Sem `credentials`, testa o que já está salvo para o provider; com
// `credentials`, testa o rascunho sem salvar nada.
export function testErpIntegrationConnection(
  provider: string,
  credentials?: Record<string, string>
): Promise<ErpIntegrationTestResult> {
  return adminJson(
    '/api/erp-integration/test',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, credentials }),
    },
    'Não foi possível testar a conexão.'
  );
}

export function activateErpIntegration(provider: string): Promise<ErpIntegrationOption> {
  return adminJson(
    '/api/erp-integration/activate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    },
    'Não foi possível ativar o provedor.'
  );
}

export function deactivateErpIntegration(): Promise<{ deactivated: boolean }> {
  return adminJson('/api/erp-integration/deactivate', { method: 'POST' }, 'Não foi possível desativar o provedor.');
}
