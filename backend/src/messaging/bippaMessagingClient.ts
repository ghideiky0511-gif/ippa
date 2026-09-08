// Operações de negócio sobre o bippa-messaging (serviço central que fala
// com a Meta em nome de todos os tenants da bippa) -- camada fina sobre
// bippaMessagingRequest, mesmo desenho de backend/src/whatsapp/client.ts
// sobre whatsAppGraphRequest, mas para o novo serviço em vez da Graph API
// direta. Não conhece tenant/banco -- recebe sempre a API key de serviço
// (bippaAuthClient.getApiKey()) explicitamente por parâmetro, nunca lê
// cookie/sessão. Não há mais bearer humano: as operações administrativas
// (instalar app, iniciar onboarding, listar conexões, associar sender
// profile) usam a mesma API key de serviço, com escopo messaging:control.

import type { ExternalApiCallReporter } from "@/lib/externalApiCall";
import { bippaMessagingRequest } from "./http";

function baseUrl(): string {
    const base = process.env.BIPPA_MESSAGING_BASE_URL || "https://bippa-messaging.onrender.com";
    return base.replace(/\/+$/, "");
}

export interface EnsureApplicationInstallationInput {
    sourceReference: string;
    organizationName: string;
}

export interface ApplicationInstallation {
    id: string;
    externalReference: string;
    created: boolean;
    organizationId: string;
}

interface ApplicationInstallationProvisionResponse {
    organization: { id: string; name: string };
    installation: {
        id: string;
        application_code: string;
        external_reference: string;
        created: boolean;
    };
}

// Garante que o tenant (identificado por source_reference = tenant.id) tem
// uma instalação do app "bippa-catalogo" no bippa-messaging -- idempotente
// por (application_code, source_reference), deve ser chamado antes de
// iniciar uma tentativa de onboarding. application_code é lido pelo
// bippa-messaging da própria API key autenticada (auth.application_code),
// não vai no body -- a rota antiga (POST /v1/admin/application-installations,
// que exige organization_id no body) foi substituída por esta
// (.../provision) especificamente porque o Catálogo nunca tem esse id antes
// da primeira chamada de um tenant novo.
export function ensureApplicationInstallation(
    apiKey: string,
    input: EnsureApplicationInstallationInput,
    reporter?: ExternalApiCallReporter,
): Promise<ApplicationInstallation> {
    return bippaMessagingRequest<ApplicationInstallationProvisionResponse>(
        "POST",
        `${baseUrl()}/v1/admin/application-installations/provision`,
        {
            service: "bippa-messaging",
            apiKey,
            jsonBody: { source_reference: input.sourceReference, organization_name: input.organizationName },
            operation: "ensureApplicationInstallation",
            reporter,
        },
    ).then((response) => ({
        id: response.installation.id,
        externalReference: response.installation.external_reference,
        created: response.installation.created,
        organizationId: response.organization.id,
    }));
}

export interface StartOnboardingAttemptInput {
    applicationCode: string;
    sourceReference: string;
    actorReference: string;
    destinationKey: string;
}

export interface OnboardingSdkConfig {
    appId: string;
    configId: string;
    graphApiVersion: string;
    extras: Record<string, unknown>;
}

export interface OnboardingAttempt {
    attemptId: string;
    connectUrl: string;
    state: string;
    expiresAt: string;
    sdk: OnboardingSdkConfig;
}

interface StartOnboardingAttemptResponse {
    onboarding: {
        attempt_id: string;
        state: string;
        expires_at: string;
        connect_url: string;
        callback_url: string;
        sdk: { app_id: string; config_id: string; graph_api_version: string; extras?: Record<string, unknown> };
    };
}

// Abre uma tentativa de Embedded Signup -- devolve a URL que o frontend abre
// num popup, o `attempt_id` que o backend persiste para reconciliar depois
// (ver whatsappOnboardingService.ts) e o `state` que confirma, via
// postMessage, que a resposta veio desta tentativa. `state` NUNCA deve ser
// persistido nem logado -- só repassado ao frontend uma vez.
export function startOnboardingAttempt(
    apiKey: string,
    input: StartOnboardingAttemptInput,
    reporter?: ExternalApiCallReporter,
): Promise<OnboardingAttempt> {
    return bippaMessagingRequest<StartOnboardingAttemptResponse>(
        "POST",
        `${baseUrl()}/v1/admin/onboarding/attempts`,
        {
            service: "bippa-messaging",
            apiKey,
            jsonBody: {
                application_code: input.applicationCode,
                source_reference: input.sourceReference,
                actor_reference: input.actorReference,
                destination_key: input.destinationKey,
            },
            operation: "startOnboardingAttempt",
            reporter,
        },
    ).then((response) => ({
        attemptId: response.onboarding.attempt_id,
        connectUrl: response.onboarding.connect_url,
        state: response.onboarding.state,
        expiresAt: response.onboarding.expires_at,
        sdk: {
            appId: response.onboarding.sdk.app_id,
            configId: response.onboarding.sdk.config_id,
            graphApiVersion: response.onboarding.sdk.graph_api_version,
            extras: response.onboarding.sdk.extras ?? {},
        },
    }));
}

export interface OnboardingAttemptConnection {
    id: string;
    wabaId: string;
    status: string;
    expiresAt: string | null;
    ownerBusinessId: string;
    grantedScopes: string[];
}

export interface OnboardingAttemptPhone {
    id: string;
    phoneNumberId: string;
    displayPhoneNumber: string;
    verifiedName: string | null;
    qualityRating: string | null;
    active: boolean;
}

export interface OnboardingAttemptResult {
    connection: OnboardingAttemptConnection;
    phones: OnboardingAttemptPhone[];
}

export interface OnboardingAttemptStatus {
    id: string;
    status: "pending" | "processing" | "completed" | "failed" | "expired";
    result: OnboardingAttemptResult | null;
    errorCode: string | null;
    errorMessage: string | null;
    expiresAt: string;
    consumedAt: string | null;
    completedAt: string | null;
    createdAt: string;
}

interface GetOnboardingAttemptResponse {
    onboarding: {
        id: string;
        destination_key: string;
        status: OnboardingAttemptStatus["status"];
        result: {
            destination_key: string;
            connection: {
                id: string;
                waba_id: string;
                status: string;
                expires_at: string | null;
                owner_business_id: string;
                granted_scopes: string[];
            };
            phones: Array<{
                id: string;
                phone_number_id: string;
                display_phone_number: string;
                verified_name: string | null;
                quality_rating: string | null;
                active: boolean;
            }>;
        } | null;
        error_code: string | null;
        error_message: string | null;
        expires_at: string;
        consumed_at: string | null;
        completed_at: string | null;
        created_at: string;
    };
}

// Reconcilia uma tentativa pelo `attempt_id` -- fonte de verdade do estado
// do onboarding (o postMessage do popup só antecipa a primeira consulta).
// `sourceReference` é sempre a mesma referência canônica usada ao abrir a
// tentativa; a rota exige o par (attempt_id, source_reference) para não
// permitir que uma tentativa de outro tenant seja consultada mesmo que o
// uuid vaze. Um 404 aqui (attempt_id ausente ou de outro tenant) chega como
// BippaMessagingClientError com statusCode 404 -- ver
// whatsappOnboardingService.reconcileWhatsAppOnboardingAttempt, que trata
// isso separado de um 4xx de contrato.
export function getOnboardingAttempt(
    apiKey: string,
    attemptId: string,
    sourceReference: string,
    reporter?: ExternalApiCallReporter,
): Promise<OnboardingAttemptStatus> {
    return bippaMessagingRequest<GetOnboardingAttemptResponse>(
        "GET",
        `${baseUrl()}/v1/admin/onboarding/attempts/${encodeURIComponent(attemptId)}`,
        {
            service: "bippa-messaging",
            apiKey,
            params: { source_reference: sourceReference },
            operation: "getOnboardingAttempt",
            reporter,
        },
    ).then((response) => ({
        id: response.onboarding.id,
        status: response.onboarding.status,
        result: response.onboarding.result
            ? {
                  connection: {
                      id: response.onboarding.result.connection.id,
                      wabaId: response.onboarding.result.connection.waba_id,
                      status: response.onboarding.result.connection.status,
                      expiresAt: response.onboarding.result.connection.expires_at,
                      ownerBusinessId: response.onboarding.result.connection.owner_business_id,
                      grantedScopes: response.onboarding.result.connection.granted_scopes,
                  },
                  phones: response.onboarding.result.phones.map((phone) => ({
                      id: phone.id,
                      phoneNumberId: phone.phone_number_id,
                      displayPhoneNumber: phone.display_phone_number,
                      verifiedName: phone.verified_name,
                      qualityRating: phone.quality_rating,
                      active: phone.active,
                  })),
              }
            : null,
        errorCode: response.onboarding.error_code,
        errorMessage: response.onboarding.error_message,
        expiresAt: response.onboarding.expires_at,
        consumedAt: response.onboarding.consumed_at,
        completedAt: response.onboarding.completed_at,
        createdAt: response.onboarding.created_at,
    }));
}

export interface WhatsAppConnectionEntry {
    phoneId: string;
    displayPhoneMasked: string | null;
    verifiedName: string | null;
    qualityRating: string | null;
    senderProfileKey: string | null;
    status: string;
}

interface WhatsAppConnectionEntryResponse {
    phone_id: string;
    display_phone_masked?: string | null;
    verified_name?: string | null;
    quality_rating?: string | null;
    sender_profile_key?: string | null;
    status: string;
}

interface ListWhatsAppConnectionsResponse {
    data: WhatsAppConnectionEntryResponse[];
}

// Lista os telefones do WhatsApp já vinculados à instalação identificada por
// `sourceReference` no bippa-messaging -- usado depois do Embedded Signup
// concluir, para a administradora escolher qual telefone associar ao sender
// profile da vendedora. `source_reference` é OBRIGATÓRIO na rota: autenticar
// só com a API key não diz qual tenant/vendedora deve ser consultado (a key
// é da aplicação inteira, não por instalação) -- sem o filtro, uma
// vendedora veria telefones de outra.
export function listWhatsAppConnections(
    apiKey: string,
    sourceReference: string,
    reporter?: ExternalApiCallReporter,
): Promise<WhatsAppConnectionEntry[]> {
    return bippaMessagingRequest<ListWhatsAppConnectionsResponse>(
        "GET",
        `${baseUrl()}/v1/admin/whatsapp-connections`,
        {
            service: "bippa-messaging",
            apiKey,
            params: { source_reference: sourceReference },
            operation: "listWhatsAppConnections",
            reporter,
        },
    ).then((response) =>
        (response.data ?? []).map((entry) => ({
            phoneId: entry.phone_id,
            displayPhoneMasked: entry.display_phone_masked ?? null,
            verifiedName: entry.verified_name ?? null,
            qualityRating: entry.quality_rating ?? null,
            senderProfileKey: entry.sender_profile_key ?? null,
            status: entry.status,
        })),
    );
}

export interface AssociateSenderProfileInput {
    externalReference: string;
    senderProfileKey: string;
    capabilityPayments: boolean;
}

export interface SenderProfileAssociation {
    phoneId: string;
    senderProfileKey: string;
    capabilityPayments: boolean;
    displayPhoneMasked: string | null;
    verifiedName: string | null;
    qualityRating: string | null;
    status: string;
}

interface SenderProfileAssociationResponse {
    phone_id: string;
    sender_profile_key: string;
    capability_payments: boolean;
    display_phone_masked?: string | null;
    verified_name?: string | null;
    quality_rating?: string | null;
    status: string;
}

// Vincula um telefone já conectado no bippa-messaging ao sender profile
// deste tenant -- é este vínculo que passa a permitir o envio de mensagens
// em nome do tenant (ver sendMessage abaixo, `sender_profile`).
export function associateSenderProfile(
    apiKey: string,
    phoneId: string,
    input: AssociateSenderProfileInput,
    reporter?: ExternalApiCallReporter,
): Promise<SenderProfileAssociation> {
    return bippaMessagingRequest<SenderProfileAssociationResponse>(
        "PATCH",
        `${baseUrl()}/v1/admin/phones/${encodeURIComponent(phoneId)}/sender-profile`,
        {
            service: "bippa-messaging",
            apiKey,
            jsonBody: {
                external_reference: input.externalReference,
                sender_profile_key: input.senderProfileKey,
                capability_payments: input.capabilityPayments,
            },
            operation: "associateSenderProfile",
            reporter,
        },
    ).then((response) => ({
        phoneId: response.phone_id,
        senderProfileKey: response.sender_profile_key,
        capabilityPayments: response.capability_payments,
        displayPhoneMasked: response.display_phone_masked ?? null,
        verifiedName: response.verified_name ?? null,
        qualityRating: response.quality_rating ?? null,
        status: response.status,
    }));
}

export interface SendMessageTemplateInput {
    name: string;
    languageCode: string;
    bodyParameters?: string[];
}

export interface SendMessageInput {
    sourceReference: string;
    senderProfile: string;
    to: string;
    template: SendMessageTemplateInput;
}

export interface SendMessageResult {
    id: string;
}

export interface CreateMessageTemplateInput {
    sourceReference: string;
    senderProfile: string;
    name: string;
    category: "UTILITY";
    languageCode: string;
    body: string;
    bodyExamples: string[];
}

export interface CreateMessageTemplateResult {
    id: string | null;
    name: string;
    status: string;
    category: string;
    languageCode: string;
}

interface CreateMessageTemplateResponse {
    id?: string;
    name?: string;
    status?: string;
    category?: string;
    language?: string;
    template?: {
        id?: string;
        name?: string;
        status?: string;
        category?: string;
        language?: string;
    };
}

// O bippa-messaging resolve o WABA a partir do telefone conectado. Assim o
// Catálogo não recebe waba_id nem credencial Meta. O payload interno mantém os
// componentes no formato da Graph API para o serviço central validar,
// autorizar e encaminhar a criação.
export function createMessageTemplate(
    apiKey: string,
    phoneId: string,
    input: CreateMessageTemplateInput,
    reporter?: ExternalApiCallReporter,
): Promise<CreateMessageTemplateResult> {
    return bippaMessagingRequest<CreateMessageTemplateResponse>(
        "POST",
        `${baseUrl()}/v1/admin/phones/${encodeURIComponent(phoneId)}/message-templates`,
        {
            service: "bippa-messaging",
            apiKey,
            jsonBody: {
                source_reference: input.sourceReference,
                sender_profile: input.senderProfile,
                template: {
                    name: input.name,
                    category: input.category,
                    language: input.languageCode,
                    allow_category_change: false,
                    components: [
                        {
                            type: "BODY",
                            text: input.body,
                            example: { body_text: [input.bodyExamples] },
                        },
                    ],
                },
            },
            operation: "createMessageTemplate",
            reporter,
        },
    ).then((response) => {
        const template = response.template ?? response;
        return {
            id: template.id ?? null,
            name: template.name ?? input.name,
            status: template.status ?? "PENDING",
            category: template.category ?? input.category,
            languageCode: template.language ?? input.languageCode,
        };
    });
}

interface SendMessageResponse {
    id: string;
}

// ATENÇÃO: o contrato exato deste endpoint NÃO está especificado na tarefa
// que originou esta integração -- POST /v1/messages com o body abaixo é um
// formato PLAUSÍVEL (espelha o envelope de template da própria Cloud API,
// que era o transporte anterior), mas precisa ser VALIDADO contra a
// documentação real do bippa-messaging antes do primeiro envio real (mesmo
// disclaimer que existia em whatsapp/client.ts sobre a Graph API -- aqui o
// risco é maior porque não há doc pública nenhuma pra conferir, só a
// convenção REST já usada nos outros endpoints A-D deste client).
export function sendMessage(
    apiKey: string,
    input: SendMessageInput,
    reporter?: ExternalApiCallReporter,
): Promise<SendMessageResult> {
    return bippaMessagingRequest<SendMessageResponse>("POST", `${baseUrl()}/v1/messages`, {
        service: "bippa-messaging",
        apiKey,
        jsonBody: {
            source_reference: input.sourceReference,
            sender_profile: input.senderProfile,
            to: input.to,
            template: {
                name: input.template.name,
                languageCode: input.template.languageCode,
                bodyParameters: input.template.bodyParameters ?? [],
            },
        },
        operation: "sendMessage",
        reporter,
    });
}
