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
    destinationKey: string;
}

export interface OnboardingAttempt {
    connectUrl: string;
    state: string;
}

interface StartOnboardingAttemptResponse {
    onboarding: { connect_url: string; state: string };
}

// Abre uma tentativa de Embedded Signup -- devolve a URL que o frontend abre
// num popup e o `state` que confirma, no fim do fluxo, que a resposta
// recebida via postMessage corresponde a esta tentativa.
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
                destination_key: input.destinationKey,
            },
            operation: "startOnboardingAttempt",
            reporter,
        },
    ).then((response) => ({
        connectUrl: response.onboarding.connect_url,
        state: response.onboarding.state,
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

// Lista os telefones do WhatsApp já vinculados à organização do token
// autenticado no bippa-messaging -- usado depois do Embedded Signup
// concluir, para a administradora escolher qual telefone associar ao
// sender profile do tenant.
export function listWhatsAppConnections(
    apiKey: string,
    reporter?: ExternalApiCallReporter,
): Promise<WhatsAppConnectionEntry[]> {
    return bippaMessagingRequest<ListWhatsAppConnectionsResponse>(
        "GET",
        `${baseUrl()}/v1/admin/whatsapp-connections`,
        { service: "bippa-messaging", apiKey, operation: "listWhatsAppConnections", reporter },
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
