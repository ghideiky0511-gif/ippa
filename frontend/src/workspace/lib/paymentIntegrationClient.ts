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
  onboardingType?: 'credentials' | 'redirect';
  configured: boolean;
  active: boolean;
  stripeAccountId?: string | null;
  stripeOnboardingStatus?: 'pending' | 'complete' | 'restricted' | null;
  stripeApiVersion?: 'v2' | null;
  // Espelha stripeAccountId: id do vendedor Mercado Pago, só exibição.
  mercadoPagoUserId?: string | null;
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

export interface StripeOnboardingStatusResult {
  stripeAccountId: string;
  status: 'pending' | 'complete' | 'restricted';
  active: boolean;
  requirements: {
    disabledReason: string | null;
    currentlyDue: string[];
    pastDue: string[];
  };
}

// Stripe Connect é diferente dos providers por credenciais: a conta do
// tenant é criada pela plataforma e o cadastro/KYC acontece em uma página
// hospedada pela Stripe. A URL devolvida é de uso único e deve receber
// navegação completa do browser, não um popup.
export function createStripeOnboardingLink(returnUrl: string): Promise<{ url: string }> {
  return adminJson(
    '/api/payment-integration/stripe/onboarding-link',
    unknown,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnUrl }),
    },
    'Não foi possível iniciar o cadastro da Stripe.'
  ) as Promise<{ url: string }>;
}

export function refreshStripeOnboardingStatus(): Promise<StripeOnboardingStatusResult> {
  return adminJson(
    '/api/payment-integration/stripe/status',
    unknown,
    { method: 'POST' },
    'Não foi possível consultar o status da conta Stripe.'
  ) as Promise<StripeOnboardingStatusResult>;
}

export function disconnectStripeAccount(): Promise<{ disconnected: boolean }> {
  return adminJson(
    '/api/payment-integration/stripe/disconnect',
    unknown,
    { method: 'POST' },
    'Não foi possível desvincular a conta Stripe.'
  ) as Promise<{ disconnected: boolean }>;
}

// Mercado Pago (Split Payments) -- mesmo desenho de onboarding hospedado da
// Stripe (URL de uso único, navegação completa do browser), mas mais
// simples: a ativação é síncrona no callback OAuth (ver
// mercadoPagoOnboardingService.ts), sem um status assíncrono pra consultar
// depois -- por isso não há um equivalente a refreshStripeOnboardingStatus.
export function createMercadoPagoOnboardingLink(returnUrl: string): Promise<{ url: string }> {
  return adminJson(
    '/api/payment-integration/mercadopago/onboarding-link',
    unknown,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnUrl }),
    },
    'Não foi possível iniciar a conexão com o Mercado Pago.'
  ) as Promise<{ url: string }>;
}

export function disconnectMercadoPagoAccount(): Promise<{ disconnected: boolean }> {
  return adminJson(
    '/api/payment-integration/mercadopago/disconnect',
    unknown,
    { method: 'POST' },
    'Não foi possível desvincular a conta Mercado Pago.'
  ) as Promise<{ disconnected: boolean }>;
}

export interface MercadoPagoAccountSummary {
  id: string;
  nickname?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  documentType?: string;
  documentNumberMasked?: string;
  siteStatus?: string;
}

// Busca nome/apelido/documento (já redigido pelo backend) da conta
// conectada -- só pra exibir na tela como prova visual de qual conta o
// access_token salvo representa, ver MercadoPagoIntegrationApp.tsx.
export function fetchMercadoPagoAccountSummary(): Promise<MercadoPagoAccountSummary> {
  return adminJson(
    '/api/payment-integration/mercadopago/account',
    unknown,
    {},
    'Não foi possível carregar os dados da conta Mercado Pago.'
  ) as Promise<MercadoPagoAccountSummary>;
}
