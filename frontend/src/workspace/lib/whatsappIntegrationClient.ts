import { z } from 'zod';
import { adminJson } from './http';

// Cliente para as rotas admin/whatsapp do backend (ver
// backend/src/app/api/[tenantSlug]/admin/whatsapp/*) -- proxy fino sobre o
// bippa-messaging, nunca fala direto com a Meta nem guarda token no
// frontend. Espelha a estrutura de paymentIntegrationClient.ts.

// Origem confiável para o postMessage do popup de Embedded Signup -- NUNCA
// aceitar eventos de outra origem, e nunca usar '*' como targetOrigin ao
// mandar mensagem para o popup (ver WhatsAppIntegrationApp.tsx).
export const BIPPA_MESSAGING_ORIGIN = 'https://bippa-messaging.onrender.com';

/** Função pura, testável isoladamente sem DOM completo. */
export function isTrustedBippaMessagingOrigin(origin: string): boolean {
  return origin === BIPPA_MESSAGING_ORIGIN;
}

const unknown = z.unknown();

export interface WhatsAppInstallationResult {
  installed: boolean;
}

export function ensureWhatsAppInstallation(): Promise<WhatsAppInstallationResult> {
  return adminJson(
    '/api/admin/whatsapp/installations',
    unknown,
    { method: 'POST' },
    'Não foi possível preparar a conexão com o WhatsApp.'
  ) as Promise<WhatsAppInstallationResult>;
}

export interface WhatsAppOnboardingAttempt {
  connectUrl: string;
  state: string;
}

// Abre a tentativa de conexão em nome de UMA vendedora (sellerId) -- cada
// vendedora tem seu próprio número, então quem inicia precisa dizer para
// qual vendedora está conectando.
export function startWhatsAppOnboardingAttempt(sellerId: string): Promise<WhatsAppOnboardingAttempt> {
  return adminJson(
    '/api/admin/whatsapp/onboarding-attempts',
    unknown,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sellerId }) },
    'Não foi possível iniciar a conexão com o WhatsApp.'
  ) as Promise<WhatsAppOnboardingAttempt>;
}

export interface WhatsAppConnectionOption {
  phoneId: string;
  displayPhoneMasked: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
  senderProfileKey: string | null;
  status: string;
}

// Lista telefones já conectados à organização no bippa-messaging -- usada
// tanto para escolher um telefone para associar quanto pela ação restrita
// "Verificar conexão".
export function fetchWhatsAppConnections(): Promise<WhatsAppConnectionOption[]> {
  return adminJson(
    '/api/admin/whatsapp/connections',
    unknown,
    {},
    'Não foi possível consultar os telefones conectados.'
  ) as Promise<WhatsAppConnectionOption[]>;
}

export interface TenantWhatsAppConnectionStatus {
  sellerId: string;
  connected: boolean;
  phoneId: string | null;
  displayPhoneMasked: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
  senderProfileKey: string | null;
  capabilityPayments: boolean;
  status: string;
  updatedAt: string | null;
}

// Estado local (whatsapp_connections) de CADA vendedora deste tenant -- usado
// no carregamento inicial da tela, sem depender de uma chamada remota ao
// bippa-messaging. Uma vendedora sem tentativa de conexão ainda não aparece
// na lista (tratar como 'not_connected' na UI).
export function fetchTenantWhatsAppConnectionStatuses(): Promise<TenantWhatsAppConnectionStatus[]> {
  return adminJson(
    '/api/admin/whatsapp/status',
    unknown,
    {},
    'Não foi possível carregar o status da conexão com o WhatsApp.'
  ) as Promise<TenantWhatsAppConnectionStatus[]>;
}

// Vincula um telefone ao sender profile da vendedora `sellerId` --
// capability_payments sempre false (não há toggle na UI, ver nota em
// WhatsAppIntegrationApp.tsx). Só depois desta chamada confirmar é que a UI
// pode mostrar "conectado".
export function associateWhatsAppSenderProfile(sellerId: string, phoneId: string): Promise<TenantWhatsAppConnectionStatus> {
  return adminJson(
    `/api/admin/whatsapp/phones/${encodeURIComponent(phoneId)}/sender-profile`,
    unknown,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sellerId }) },
    'Não foi possível associar este telefone à vendedora.'
  ) as Promise<TenantWhatsAppConnectionStatus>;
}
