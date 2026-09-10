import { z } from "zod";
import { adminJson } from "./http";

// Cliente para as rotas admin/whatsapp do backend (ver
// backend/src/app/api/[tenantSlug]/admin/whatsapp/*) -- proxy fino sobre o
// bippa-messaging, nunca fala direto com a Meta nem guarda token no
// frontend. Espelha a estrutura de paymentIntegrationClient.ts.

// A origem confiável do popup de Embedded Signup NUNCA é uma constante fixa
// -- é sempre derivada do `connectUrl` que o próprio backend devolveu para
// ESTA tentativa (o handoff é explícito: nunca aceitar `connect_url` vindo
// do navegador, e nunca usar '*' como targetOrigin). Uma constante
// hardcoded ficaria dessincronizada se o Messaging um dia responder com
// outro host (staging, troca de domínio) -- derivar por tentativa é o que
// garante que a validação sempre bate com a URL que foi de fato aberta.
export function onboardingOriginFromConnectUrl(connectUrl: string): string {
    return new URL(connectUrl).origin;
}

// Um evento de popup só é confiável se BOTH `event.origin` (o host que
// mandou a mensagem) E `event.source` (a janela exata) baterem -- checar só
// a origem permite que outra aba/iframe do mesmo host injete eventos.
export function isTrustedMessagingEvent(
    event: MessageEvent,
    expectedOrigin: string,
    expectedSource: Window | null,
): boolean {
    return event.origin === expectedOrigin && event.source === expectedSource;
}

const unknown = z.unknown();

export interface WhatsAppInstallationResult {
    installed: boolean;
}

// sellerId precisa ser o mesmo passado depois para
// startWhatsAppOnboardingAttempt -- a instalação é resolvida no
// bippa-messaging por essa mesma referência (ver
// whatsappInstallationService.ts no backend).
export function ensureWhatsAppInstallation(
    sellerId: string,
): Promise<WhatsAppInstallationResult> {
    return adminJson(
        "/api/admin/whatsapp/installations",
        unknown,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sellerId }),
        },
        "Não foi possível preparar a conexão com o WhatsApp.",
    ) as Promise<WhatsAppInstallationResult>;
}

export interface WhatsAppOnboardingSdkConfig {
    appId: string;
    configId: string;
    graphApiVersion: string;
    extras: Record<string, unknown>;
}

export interface WhatsAppOnboardingAttempt {
    attemptId: string;
    connectUrl: string;
    state: string;
    expiresAt: string;
    sdk: WhatsAppOnboardingSdkConfig;
}

// Abre a tentativa de conexão em nome de UMA vendedora (sellerId) -- cada
// vendedora tem seu próprio número, então quem inicia precisa dizer para
// qual vendedora está conectando. O navegador recebe só o necessário para
// abrir o popup e completar o handshake do postMessage -- nunca a API key
// nem qualquer credencial da Meta.
export function startWhatsAppOnboardingAttempt(
    sellerId: string,
): Promise<WhatsAppOnboardingAttempt> {
    return adminJson(
        "/api/admin/whatsapp/onboarding-attempts",
        unknown,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sellerId }),
        },
        "Não foi possível iniciar a conexão com o WhatsApp.",
    ) as Promise<WhatsAppOnboardingAttempt>;
}

export interface WhatsAppOnboardingAttemptPhone {
    id: string;
    phoneNumberId: string;
    displayPhoneNumber: string;
    verifiedName: string | null;
    qualityRating: string | null;
    active: boolean;
}

export type WhatsAppOnboardingAttemptStatusValue =
    | "pending"
    | "processing"
    | "completed"
    | "failed"
    | "expired";

export interface WhatsAppOnboardingAttemptStatus {
    attemptId: string;
    sellerId: string;
    status: WhatsAppOnboardingAttemptStatusValue;
    errorCode: string | null;
    errorMessage: string | null;
    expiresAt: string;
    phones: WhatsAppOnboardingAttemptPhone[];
}

// Reconcilia uma tentativa pelo attemptId -- fonte de verdade do fluxo,
// chamada tanto pelo polling quanto (uma vez) em reação ao postMessage
// `completed`/`failed` do popup. Repetir esta chamada é sempre seguro (GET
// idempotente).
export function fetchWhatsAppOnboardingAttemptStatus(
    attemptId: string,
): Promise<WhatsAppOnboardingAttemptStatus> {
    return adminJson(
        `/api/admin/whatsapp/onboarding-attempts/${encodeURIComponent(attemptId)}`,
        unknown,
        {},
        "Não foi possível consultar o status da conexão com o WhatsApp.",
    ) as Promise<WhatsAppOnboardingAttemptStatus>;
}

export interface WhatsAppConnectionOption {
    phoneId: string;
    phoneNumberId: string | null;
    displayPhoneMasked: string | null;
    verifiedName: string | null;
    qualityRating: string | null;
    active: boolean;
    nameStatus: string | null;
    messagingLimitTier: string | null;
    senderProfileKey: string | null;
    status: string;
}

export interface TenantWhatsAppPhoneHealth {
    phoneId: string;
    phoneNumberId: string | null;
    displayPhoneNumber: string | null;
    verifiedName: string | null;
    qualityRating: string | null;
    active: boolean;
    nameStatus: string | null;
    platformType: string | null;
    codeVerificationStatus: string | null;
    messagingLimitTier: string | null;
    sellerId: string | null;
    capabilityPayments: boolean;
    wabaId: string;
    connectionStatus: string;
}

export function fetchTenantWhatsAppPhoneHealth(sync = false): Promise<TenantWhatsAppPhoneHealth[]> {
    return adminJson(
        `/api/admin/whatsapp/numbers?sync=${sync ? "true" : "false"}`,
        unknown,
        {},
        "Não foi possível carregar os dados dos números de WhatsApp.",
    ) as Promise<TenantWhatsAppPhoneHealth[]>;
}

// Lista telefones já conectados à instalação desta vendedora no
// bippa-messaging -- usada tanto para escolher um telefone para associar
// quanto pela ação restrita "Verificar conexão". `sellerId` nunca é o
// source_reference cru -- o backend resolve isso a partir do tenant da
// sessão + desta vendedora.
export function fetchWhatsAppConnections(
    sellerId: string,
): Promise<WhatsAppConnectionOption[]> {
    return adminJson(
        `/api/admin/whatsapp/connections?sellerId=${encodeURIComponent(sellerId)}`,
        unknown,
        {},
        "Não foi possível consultar os telefones conectados.",
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
    // Tentativa de onboarding ainda não finalizada desta vendedora, se
    // existir -- usado para retomar o polling de reconciliação depois de um
    // refresh de página (ver WhatsAppIntegrationApp.tsx).
    pendingAttemptId: string | null;
    pendingExpiresAt: string | null;
}

const whatsappTemplateSchema = z.object({
    key: z.enum(["order_confirmed", "payment_link"]),
    name: z.string(),
    title: z.string(),
    description: z.string(),
    category: z.literal("UTILITY"),
    languageCode: z.literal("pt_BR"),
    body: z.string(),
    parameters: z.array(
        z.object({ key: z.string(), label: z.string(), example: z.string() }),
    ),
    metaTemplate: z.object({
        id: z.string(),
        metaTemplateId: z.string().nullable(),
        name: z.string(),
        status: z.string(),
        qualityScore: z.string().nullable(),
        rejectionReason: z.string().nullable(),
        lastSyncedAt: z.string().nullable(),
    }).nullable(),
});

export type StandardWhatsAppTemplate = z.infer<typeof whatsappTemplateSchema>;

const submittedTemplateSchema = z.object({
    key: whatsappTemplateSchema.shape.key,
    id: z.string().nullable(),
    name: z.string(),
    status: z.string(),
    category: z.string(),
    languageCode: z.string(),
});

export type SubmittedWhatsAppTemplate = z.infer<typeof submittedTemplateSchema>;

export function fetchStandardWhatsAppTemplates(): Promise<
    StandardWhatsAppTemplate[]
> {
    return fetchStandardWhatsAppTemplatesForSeller();
}

export function fetchStandardWhatsAppTemplatesForSeller(
    sellerId?: string,
    sync = false,
): Promise<StandardWhatsAppTemplate[]> {
    const params = new URLSearchParams();
    if (sellerId) params.set("sellerId", sellerId);
    if (sync) params.set("sync", "true");
    const query = params.size > 0 ? `?${params.toString()}` : "";
    return adminJson(
        `/api/admin/whatsapp/templates${query}`,
        z.array(whatsappTemplateSchema),
        {},
        "Não foi possível carregar os templates de WhatsApp.",
    );
}

export function submitStandardWhatsAppTemplate(
    sellerId: string,
    templateKey: StandardWhatsAppTemplate["key"],
    examples: string[],
): Promise<SubmittedWhatsAppTemplate> {
    return adminJson(
        "/api/admin/whatsapp/templates",
        submittedTemplateSchema,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sellerId, templateKey, examples }),
        },
        "Não foi possível enviar o template para aprovação da Meta.",
    );
}

// Estado local (whatsapp_connections) de CADA vendedora deste tenant -- usado
// no carregamento inicial da tela, sem depender de uma chamada remota ao
// bippa-messaging. Uma vendedora sem tentativa de conexão ainda não aparece
// na lista (tratar como 'not_connected' na UI).
export function fetchTenantWhatsAppConnectionStatuses(): Promise<
    TenantWhatsAppConnectionStatus[]
> {
    return adminJson(
        "/api/admin/whatsapp/status",
        unknown,
        {},
        "Não foi possível carregar o status da conexão com o WhatsApp.",
    ) as Promise<TenantWhatsAppConnectionStatus[]>;
}

// Vincula um telefone ao sender profile da vendedora `sellerId` --
// capability_payments sempre false (não há toggle na UI, ver nota em
// WhatsAppIntegrationApp.tsx). Só depois desta chamada confirmar é que a UI
// pode mostrar "conectado".
export function associateWhatsAppSenderProfile(
    sellerId: string,
    phoneId: string,
): Promise<TenantWhatsAppConnectionStatus> {
    return adminJson(
        `/api/admin/whatsapp/phones/${encodeURIComponent(phoneId)}/sender-profile`,
        unknown,
        {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sellerId }),
        },
        "Não foi possível associar este telefone à vendedora.",
    ) as Promise<TenantWhatsAppConnectionStatus>;
}
