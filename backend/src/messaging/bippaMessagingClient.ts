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
    const base =
        process.env.BIPPA_MESSAGING_BASE_URL ||
        "https://bippa-messaging.onrender.com";
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
            jsonBody: {
                source_reference: input.sourceReference,
                organization_name: input.organizationName,
            },
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
        sdk: {
            app_id: string;
            config_id: string;
            graph_api_version: string;
            extras?: Record<string, unknown>;
        };
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
    healthCanSendMessage: string | null;
    healthIssues: WhatsAppHealthIssue[];
    healthCheckedAt: string | null;
    healthManageUrl: string | null;
    healthPaymentSettingsUrl: string | null;
}

export interface OnboardingAttemptPhone {
    id: string;
    phoneNumberId: string;
    displayPhoneNumber: string;
    verifiedName: string | null;
    qualityRating: string | null;
    active: boolean;
    nameStatus: string | null;
    platformType: string | null;
    codeVerificationStatus: string | null;
    messagingLimitTier: string | null;
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
                health_can_send_message?: string | null;
                health_issues?: WhatsAppHealthIssueResponse[];
                health_checked_at?: string | null;
                health_manage_url?: string | null;
                health_payment_settings_url?: string | null;
            };
            phones: Array<{
                id: string;
                phone_number_id: string;
                display_phone_number: string;
                verified_name: string | null;
                quality_rating: string | null;
                active: boolean;
                name_status?: string | null;
                platform_type?: string | null;
                code_verification_status?: string | null;
                messaging_limit_tier?: string | null;
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
                      expiresAt:
                          response.onboarding.result.connection.expires_at,
                      ownerBusinessId:
                          response.onboarding.result.connection
                              .owner_business_id,
                      grantedScopes:
                          response.onboarding.result.connection.granted_scopes,
                      healthCanSendMessage:
                          response.onboarding.result.connection
                              .health_can_send_message ?? null,
                      healthIssues: mapWhatsAppHealthIssues(
                          response.onboarding.result.connection.health_issues,
                      ),
                      healthCheckedAt:
                          response.onboarding.result.connection
                              .health_checked_at ?? null,
                      healthManageUrl:
                          response.onboarding.result.connection
                              .health_manage_url ?? null,
                      healthPaymentSettingsUrl:
                          response.onboarding.result.connection
                              .health_payment_settings_url ?? null,
                  },
                  phones: response.onboarding.result.phones.map((phone) => ({
                      id: phone.id,
                      phoneNumberId: phone.phone_number_id,
                      displayPhoneNumber: phone.display_phone_number,
                      verifiedName: phone.verified_name,
                      qualityRating: phone.quality_rating,
                      active: phone.active,
                      nameStatus: phone.name_status ?? null,
                      platformType: phone.platform_type ?? null,
                      codeVerificationStatus:
                          phone.code_verification_status ?? null,
                      messagingLimitTier:
                          phone.messaging_limit_tier ?? null,
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
    phoneNumberId: string | null;
    displayPhoneMasked: string | null;
    verifiedName: string | null;
    qualityRating: string | null;
    active: boolean;
    nameStatus: string | null;
    platformType: string | null;
    codeVerificationStatus: string | null;
    messagingLimitTier: string | null;
    // Chave interna de roteamento do bippa-messaging -- NUNCA usar para
    // comparar/filtrar por vendedora (ver externalReference abaixo). Exposta
    // só para log/depuração.
    senderProfileKey: string | null;
    // `sender_profiles.external_reference` deste telefone, quando já
    // associado a algum sender profile -- é ISSO que identifica "de qual
    // vendedora é este telefone" (nunca senderProfileKey). `null` quando o
    // telefone ainda não foi reivindicado por nenhuma vendedora.
    externalReference: string | null;
    capabilityPayments: boolean;
    // WABA e conexão-pai deste telefone -- necessários para o fluxo de
    // templates (createWabaTemplate usa wabaId; bindTemplateToSenderProfile
    // usa o sender_profile_id retornado por associateSenderProfile, não
    // este connectionId, mas guardamos os dois para referência/depuração).
    wabaId: string;
    connectionId: string;
    status: string;
    connectionStatus: string;
    // Saude da WABA fornecida pela Meta. Esses campos pertencem a conexao,
    // mas sao repetidos em cada telefone ao achatar `connections[].phones`
    // para que a tela consiga mostrar o aviso ao lado da vendedora certa.
    healthCanSendMessage: string | null;
    healthIssues: WhatsAppHealthIssue[];
    healthCheckedAt: string | null;
    healthManageUrl: string | null;
    healthPaymentSettingsUrl: string | null;
}

export interface WhatsAppHealthIssueError {
    code: number | string | null;
    message: string | null;
    possibleSolution: string | null;
}

export interface WhatsAppHealthIssue {
    entityType: string | null;
    canSendMessage: string | null;
    errors: WhatsAppHealthIssueError[];
}

interface WhatsAppHealthIssueResponse {
    entity_type?: string | null;
    can_send_message?: string | null;
    errors?: Array<{
        code?: number | string | null;
        message?: string | null;
        possible_solution?: string | null;
    }>;
}

function mapWhatsAppHealthIssues(
    issues: WhatsAppHealthIssueResponse[] | undefined,
): WhatsAppHealthIssue[] {
    return (issues ?? []).map((issue) => ({
        entityType: issue.entity_type ?? null,
        canSendMessage: issue.can_send_message ?? null,
        errors: (issue.errors ?? []).map((error) => ({
            code: error.code ?? null,
            message: error.message ?? null,
            possibleSolution: error.possible_solution ?? null,
        })),
    }));
}

// Formato confirmado na doc oficial
// (backend/docs/mensageria/bippa-messaging/docs/api-reference.md, seção
// "Conexões, números e perfis de envio"): cada item de `data` é uma CONEXÃO
// (id=connection_id, waba_id, ...), não um telefone -- os telefones ficam
// aninhados em `phones[]` (id=phone_numbers.id, phone_number_id,
// display_phone_number, verified_name, quality_rating, active,
// sender_profile_key, external_reference, capability_payments). `id` existe
// nos dois níveis com significados DIFERENTES -- confirmado por bug em
// produção (2026-09-09): estávamos lendo o `id` do nível da conexão como se
// fosse o phoneId, o que produz um UUID que nunca existe em `phone_numbers`
// (é sempre o id de `connections`) e causa `phone_not_found` no PATCH
// .../sender-profile mesmo o telefone existindo e aparecendo nesta mesma
// listagem.
interface WhatsAppConnectionPhoneResponse {
    id: string;
    phone_number_id?: string | null;
    display_phone_number?: string | null;
    verified_name?: string | null;
    quality_rating?: string | null;
    active: boolean;
    name_status?: string | null;
    platform_type?: string | null;
    code_verification_status?: string | null;
    messaging_limit_tier?: string | null;
    sender_profile_key?: string | null;
    external_reference?: string | null;
    capability_payments?: boolean;
}

interface WhatsAppConnectionResponse {
    id: string; // id da CONEXÃO/WABA -- nunca usar como phoneId, ver acima.
    waba_id: string;
    status?: string;
    health_can_send_message?: string | null;
    health_issues?: WhatsAppHealthIssueResponse[];
    health_checked_at?: string | null;
    health_manage_url?: string | null;
    health_payment_settings_url?: string | null;
    phones?: WhatsAppConnectionPhoneResponse[];
}

interface ListWhatsAppConnectionsResponse {
    data: WhatsAppConnectionResponse[];
}

// Lista os telefones do WhatsApp já vinculados à ORGANIZAÇÃO (= tenant, ver
// whatsappInstallationService.ts) identificada por `sourceReference` no
// bippa-messaging -- usado depois do Embedded Signup concluir, para a
// administradora escolher qual telefone associar ao sender profile da
// vendedora. `source_reference` é OBRIGATÓRIO na rota: autenticar só com a
// API key não diz qual tenant deve ser consultado (a key é da aplicação
// inteira, não por instalação). A rota NÃO filtra por vendedora no servidor
// -- devolve todos os telefones da organização; quem chama filtra
// localmente comparando `externalReference` (ver
// whatsappIntegrationService.getWhatsAppConnections).
export function listWhatsAppConnections(
    apiKey: string,
    sourceReference: string,
    sync = false,
    reporter?: ExternalApiCallReporter,
): Promise<WhatsAppConnectionEntry[]> {
    return bippaMessagingRequest<ListWhatsAppConnectionsResponse>(
        "GET",
        `${baseUrl()}/v1/admin/whatsapp-connections`,
        {
            service: "bippa-messaging",
            apiKey,
            params: { source_reference: sourceReference, sync: sync ? "true" : undefined },
            operation: "listWhatsAppConnections",
            reporter,
        },
    ).then((response) =>
        (response.data ?? []).flatMap((connection) =>
            (connection.phones ?? []).map((phone) => ({
                phoneId: phone.id,
                phoneNumberId: phone.phone_number_id ?? null,
                displayPhoneMasked: phone.display_phone_number ?? null,
                verifiedName: phone.verified_name ?? null,
                qualityRating: phone.quality_rating ?? null,
                active: phone.active,
                nameStatus: phone.name_status ?? null,
                platformType: phone.platform_type ?? null,
                codeVerificationStatus: phone.code_verification_status ?? null,
                messagingLimitTier: phone.messaging_limit_tier ?? null,
                senderProfileKey: phone.sender_profile_key ?? null,
                externalReference: phone.external_reference ?? null,
                capabilityPayments: phone.capability_payments ?? false,
                wabaId: connection.waba_id,
                connectionId: connection.id,
                status: phone.active ? "connected" : "not_connected",
                connectionStatus: connection.status ?? "unknown",
                healthCanSendMessage:
                    connection.health_can_send_message ?? null,
                healthIssues: mapWhatsAppHealthIssues(
                    connection.health_issues,
                ),
                healthCheckedAt: connection.health_checked_at ?? null,
                healthManageUrl: connection.health_manage_url ?? null,
                healthPaymentSettingsUrl:
                    connection.health_payment_settings_url ?? null,
            })),
        ),
    );
}

export interface AssociateSenderProfileInput {
    // Referência do TENANT (organização no bippa-messaging) -- NUNCA a
    // referência da vendedora. Confirmado em onboarding.js (assignPhone) +
    // messaging_service.js (organizationForRequest): são dois campos
    // distintos, ambos obrigatórios, nunca um pelo outro.
    sourceReference: string;
    // Referência da VENDEDORA dentro deste tenant -- vira
    // sender_profiles.external_reference, usado depois por resolveSender().
    externalReference: string;
    senderProfileKey: string;
}

export interface SenderProfileAssociation {
    phoneId: string;
    // Id do sender profile (sender_profiles.id) -- necessário para
    // bindTemplateToSenderProfile (ver whatsappTemplateService.ts).
    senderProfileId: string;
    connectionId: string;
    senderProfileKey: string;
    // A associação não altera esta permissão. O campo pode não vir na
    // resposta das versões novas do bippa-messaging; a sincronização do
    // telefone logo em seguida é a fonte de verdade.
    capabilityPayments: boolean | null;
    displayPhoneMasked: string | null;
    verifiedName: string | null;
    qualityRating: string | null;
    status: string;
}

// Formato confirmado no código-fonte do bippa-messaging (messaging_repository.js,
// assignPhoneToSender + server.js) -- é a linha crua de bippa_messaging.sender_profiles
// (RETURNING *) embrulhada em { sender_profile }, não o formato de publicPhone().
// Por isso não tem display_phone_number/verified_name/quality_rating (essas colunas
// são de phone_numbers, não de sender_profiles) e a chave do sender profile é `key`,
// não `sender_profile_key`.
interface SenderProfileAssociationResponse {
    sender_profile: {
        id: string;
        organization_id: string;
        phone_id: string;
        key: string;
        external_reference: string;
        capability_payments?: boolean;
        connection_id: string;
    };
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
                source_reference: input.sourceReference,
                external_reference: input.externalReference,
                sender_profile_key: input.senderProfileKey,
            },
            operation: "associateSenderProfile",
            reporter,
        },
    ).then((response) => ({
        phoneId: response.sender_profile.phone_id,
        senderProfileId: response.sender_profile.id,
        connectionId: response.sender_profile.connection_id,
        senderProfileKey: response.sender_profile.key,
        capabilityPayments: response.sender_profile.capability_payments ?? null,
        // sender_profiles não guarda esses três -- pertencem a phone_numbers
        // (já obtidos antes, em listWhatsAppConnections). Este PATCH só
        // confirma o vínculo, não devolve metadados do telefone.
        displayPhoneMasked: null,
        verifiedName: null,
        qualityRating: null,
        // Sem coluna "status" em sender_profiles -- chegar aqui sem lançar já
        // significa que o vínculo foi criado/atualizado com sucesso.
        status: "connected",
    }));
}

// Contrato confirmado em
// backend/docs/mensageria/bippa-messaging/docs/api-reference.md, seção
// "Templates". Criar um template é por WABA (não por telefone -- um WABA
// pode ter vários números, o template pertence à WABA); vincular ao sender
// profile (bindTemplateToSenderProfile, logo abaixo) é o passo separado que
// permite POST /v1/dispatches resolver `template_key`.
export interface CreateWabaTemplateInput {
    sourceReference: string;
    name: string;
    languageCode: string;
    category: "UTILITY";
    body: string;
    bodyExamples: string[];
    // Botão URL dinâmico (ver whatsappTemplates.ts) -- `urlTemplate` já vem
    // no formato que a Meta espera para `buttons[].url` (domínio estático +
    // `{{1}}` no fim), `example` é o caminho de exemplo pro `{{1}}` (a Meta
    // exige um `example` por botão dinâmico, igual ao `body_text` do BODY).
    button?: { text: string; urlTemplate: string; example: string };
}

export interface CreateWabaTemplateResult {
    id: string;
    name: string;
    status: string;
    category: string;
    languageCode: string;
}

interface CreateWabaTemplateResponse {
    // Envelope confirmado com o time do bippa-messaging (server.js:363-371):
    // `res.status(201).json({ template: await templates.createTemplate(...) })`
    // -- o objeto do template vem aninhado em `template`, nunca na raiz.
    // Bug real de produção (2026-09): este client lia `response.id` direto
    // e sempre recebia `undefined`, que virava um `template_id` vazio no
    // POST .../template-bindings seguinte (rejeitado com `400
    // invalid_request` do lado de lá, sem nenhuma pista do lado de cá).
    template: {
        id: string;
        name: string;
        status: string;
        category: string;
        language: string;
    };
}

export function createWabaTemplate(
    apiKey: string,
    wabaId: string,
    input: CreateWabaTemplateInput,
    reporter?: ExternalApiCallReporter,
): Promise<CreateWabaTemplateResult> {
    return bippaMessagingRequest<CreateWabaTemplateResponse>(
        "POST",
        `${baseUrl()}/v1/admin/connections/${encodeURIComponent(wabaId)}/templates`,
        {
            service: "bippa-messaging",
            apiKey,
            jsonBody: {
                source_reference: input.sourceReference,
                name: input.name,
                language: input.languageCode,
                category: input.category,
                components: [
                    {
                        type: "BODY",
                        text: input.body,
                        example: { body_text: [input.bodyExamples] },
                    },
                    ...(input.button
                        ? [
                              {
                                  type: "BUTTONS",
                                  buttons: [
                                      {
                                          type: "URL",
                                          text: input.button.text,
                                          url: input.button.urlTemplate,
                                          // A Meta exige a URL COMPLETA de exemplo (com a
                                          // variável já resolvida), não só o valor do
                                          // parâmetro -- ex.: "https://loja.com/pedidos/1234",
                                          // nunca "1234" solto. `urlTemplate` sempre termina em
                                          // "{{1}}" (ver StandardWhatsAppTemplate.button em
                                          // whatsappTemplates.ts), então basta substituir o
                                          // sufixo pelo exemplo recebido.
                                          example: [
                                              input.button.urlTemplate.replace(
                                                  /\{\{1\}\}$/,
                                                  input.button.example,
                                              ),
                                          ],
                                      },
                                  ],
                              },
                          ]
                        : []),
                ],
            },
            operation: "createWabaTemplate",
            reporter,
        },
    ).then((response) => ({
        id: response.template.id,
        name: response.template.name,
        status: response.template.status,
        category: response.template.category,
        languageCode: response.template.language,
    }));
}

export interface SetPaymentsCapabilityInput {
    sourceReference: string;
    capabilityPayments: boolean;
    reason: string;
    actorReference: string;
}

interface SetPaymentsCapabilityResponse {
    sender_profile: {
        id: string;
        phone_id: string;
        connection_id: string;
        key: string;
        external_reference: string;
        capability_payments: boolean;
    };
}

// Esta é deliberadamente uma operação diferente da associação de
// telefone. A Meta não expõe uma verificação programática da aprovação;
// portanto, só o fluxo administrativo explícito deve chamá-la.
export function setPaymentsCapability(
    apiKey: string,
    senderProfileId: string,
    input: SetPaymentsCapabilityInput,
    reporter?: ExternalApiCallReporter,
): Promise<{ capabilityPayments: boolean }> {
    return bippaMessagingRequest<SetPaymentsCapabilityResponse>(
        "PATCH",
        `${baseUrl()}/v1/admin/sender-profiles/${encodeURIComponent(senderProfileId)}/payments-capability`,
        {
            service: "bippa-messaging",
            apiKey,
            jsonBody: {
                source_reference: input.sourceReference,
                capability_payments: input.capabilityPayments,
                reason: input.reason,
                actor_reference: input.actorReference,
            },
            operation: "setPaymentsCapability",
            reporter,
        },
    ).then((response) => ({
        capabilityPayments: response.sender_profile.capability_payments,
    }));
}

// Leitura dos templates cadastrados na WABA. O produto só compara esta lista
// com o catálogo fechado de templates de pedidos; não expõe criação, edição
// ou exclusão de templates livres.
export interface WhatsAppTemplateEntry {
    id: string;
    organizationId: string | null;
    wabaId: string;
    metaTemplateId: string | null;
    name: string;
    language: string;
    category: string;
    status: string;
    qualityScore: string | null;
    rejectionReason: string | null;
    components: Array<Record<string, unknown>>;
    lastSyncedAt: string | null;
}

interface WhatsAppTemplateResponse {
    id: string;
    organization_id?: string | null;
    waba_id: string;
    meta_template_id?: string | null;
    name: string;
    language: string;
    category: string;
    status: string;
    quality_score?: string | null;
    rejection_reason?: string | null;
    components?: Array<Record<string, unknown>>;
    last_synced_at?: string | null;
}

function toWhatsAppTemplateEntry(template: WhatsAppTemplateResponse): WhatsAppTemplateEntry {
    return {
        id: template.id,
        organizationId: template.organization_id ?? null,
        wabaId: template.waba_id,
        metaTemplateId: template.meta_template_id ?? null,
        name: template.name,
        language: template.language,
        category: template.category,
        status: template.status,
        qualityScore: template.quality_score ?? null,
        rejectionReason: template.rejection_reason ?? null,
        components: template.components ?? [],
        lastSyncedAt: template.last_synced_at ?? null,
    };
}

export function listWabaTemplates(
    apiKey: string,
    wabaId: string,
    sourceReference: string,
    sync = true,
    reporter?: ExternalApiCallReporter,
): Promise<WhatsAppTemplateEntry[]> {
    return bippaMessagingRequest<{ data: WhatsAppTemplateResponse[] }>(
        "GET",
        `${baseUrl()}/v1/admin/connections/${encodeURIComponent(wabaId)}/templates`,
        {
            service: "bippa-messaging",
            apiKey,
            params: { source_reference: sourceReference, sync: String(sync) },
            operation: "listWabaTemplates",
            reporter,
        },
    ).then((response) => (response.data ?? []).map(toWhatsAppTemplateEntry));
}

// Vincula um template já criado na WABA (createWabaTemplate) a um sender
// profile, sob uma chave de negócio (`templateKey`, ex.: "order_confirmed")
// -- é essa chave que POST /v1/dispatches usa depois em
// payload.template_key, nunca o nome real da template na Meta.
export interface BindTemplateToSenderProfileInput {
    sourceReference: string;
    templateId: string;
    templateKey: string;
}

export interface TemplateBinding {
    id: string;
    senderProfileId: string;
    templateId: string;
    templateKey: string;
    status: string;
}

interface TemplateBindingResponse {
    id: string;
    sender_profile_id: string;
    template_id: string;
    template_key: string;
    status: string;
}

export function bindTemplateToSenderProfile(
    apiKey: string,
    senderProfileId: string,
    input: BindTemplateToSenderProfileInput,
    reporter?: ExternalApiCallReporter,
): Promise<TemplateBinding> {
    return bippaMessagingRequest<TemplateBindingResponse>(
        "POST",
        `${baseUrl()}/v1/admin/sender-profiles/${encodeURIComponent(senderProfileId)}/template-bindings`,
        {
            service: "bippa-messaging",
            apiKey,
            jsonBody: {
                source_reference: input.sourceReference,
                template_id: input.templateId,
                template_key: input.templateKey,
            },
            operation: "bindTemplateToSenderProfile",
            reporter,
        },
    ).then((response) => ({
        id: response.id,
        senderProfileId: response.sender_profile_id,
        templateId: response.template_id,
        templateKey: response.template_key,
        status: response.status,
    }));
}

// Contrato confirmado em api-reference.md, seção "Envio de mensagens" --
// substitui o antigo POST /v1/messages (nunca validado contra documentação
// real, ver histórico deste arquivo). `sellerReference` é o
// `external_reference` do sender profile (nunca a chave interna
// `sender_profile_key`); `idempotencyKey` é obrigatória e única por
// organização.
export interface DispatchTemplateMessageInput {
    sourceReference: string;
    sellerReference: string;
    to: string;
    idempotencyKey: string;
    templateKey: string;
    params: Record<string, string>;
    mediaUrl?: string;
}

export interface DispatchMessageResult {
    id: string;
    duplicate: boolean;
}

interface DispatchMessageResponse {
    dispatch: { id: string };
    duplicate: boolean;
}

export function dispatchTemplateMessage(
    apiKey: string,
    input: DispatchTemplateMessageInput,
    reporter?: ExternalApiCallReporter,
): Promise<DispatchMessageResult> {
    return bippaMessagingRequest<DispatchMessageResponse>(
        "POST",
        `${baseUrl()}/v1/dispatches`,
        {
            service: "bippa-messaging",
            apiKey,
            jsonBody: {
                source_reference: input.sourceReference,
                seller_reference: input.sellerReference,
                recipient: input.to,
                kind: "template",
                idempotency_key: input.idempotencyKey,
                payload: {
                    template_key: input.templateKey,
                    params: input.params,
                    ...(input.mediaUrl ? { media_url: input.mediaUrl } : {}),
                },
            },
            operation: "dispatchTemplateMessage",
            reporter,
        },
    ).then((response) => ({
        id: response.dispatch.id,
        duplicate: response.duplicate,
    }));
}

// Variante para templates com um botão URL dinâmico (ver whatsappTemplates.ts
// -- STANDARD_WHATSAPP_TEMPLATES não coloca mais link no BODY, só num botão
// dedicado). `payload.template_key`/`payload.params` (dispatchTemplateMessage
// acima) só preenchem os componentes BODY/HEADER do template
// (api-reference.md, seção "Envio de mensagens": "Esse atalho só monta
// componentes body/header"); o parâmetro do botão exige o `payload.template`
// bruto documentado ali mesmo ("passe o objeto template já pronto... repassado
// sem transformação nenhuma"), com `name`/`language` do template (não
// `template_key`) e `index`/`sub_type` batendo com a posição real do botão
// aprovado -- o botão URL é sempre o único e primeiro botão dos templates
// deste catálogo, por isso `index: "0"` fixo aqui.
export interface DispatchTemplateWithUrlButtonInput {
    sourceReference: string;
    sellerReference: string;
    to: string;
    idempotencyKey: string;
    templateName: string;
    languageCode: string;
    bodyParams: string[];
    buttonParam: string;
    mediaUrl?: string;
}

export function dispatchTemplateWithUrlButton(
    apiKey: string,
    input: DispatchTemplateWithUrlButtonInput,
    reporter?: ExternalApiCallReporter,
): Promise<DispatchMessageResult> {
    return bippaMessagingRequest<DispatchMessageResponse>(
        "POST",
        `${baseUrl()}/v1/dispatches`,
        {
            service: "bippa-messaging",
            apiKey,
            jsonBody: {
                source_reference: input.sourceReference,
                seller_reference: input.sellerReference,
                recipient: input.to,
                kind: "template",
                idempotency_key: input.idempotencyKey,
                payload: {
                    template: {
                        name: input.templateName,
                        language: { code: input.languageCode },
                        components: [
                            ...(input.mediaUrl
                                ? [
                                      {
                                          type: "header",
                                          parameters: [
                                              { type: "image", image: { link: input.mediaUrl } },
                                          ],
                                      },
                                  ]
                                : []),
                            {
                                type: "body",
                                parameters: input.bodyParams.map((value) => ({
                                    type: "text",
                                    text: value,
                                })),
                            },
                            {
                                type: "button",
                                sub_type: "url",
                                index: "0",
                                parameters: [{ type: "text", text: input.buttonParam }],
                            },
                        ],
                    },
                },
            },
            operation: "dispatchTemplateWithUrlButton",
            reporter,
        },
    ).then((response) => ({
        id: response.dispatch.id,
        duplicate: response.duplicate,
    }));
}

// POST /v1/payment-orders -- order_details nativo da Meta Payments API,
// pagável DENTRO do WhatsApp (diferente de dispatchTemplateMessage/
// dispatchTemplateWithUrlButton acima, que só levam a cliente pra fora do
// WhatsApp via link). Único caminho ainda implementado aqui é PIX dinâmico
// (ver whatsappNotificationService.ts::sendPaymentOrderWhatsAppNow) --
// requer `seller_reference` com capability_payments: true, senão 422
// payments_not_enabled_for_sender (ver api-reference.md, seção
// "Orders / Pagamentos (Meta Payments)").
export interface PaymentOrderItemInput {
    retailerId: string;
    name: string;
    unitAmount: number;
    quantity: number;
}

export interface DispatchPaymentOrderInput {
    sourceReference: string;
    sellerReference: string;
    to: string;
    idempotencyKey: string;
    referenceId: string;
    items: PaymentOrderItemInput[];
    taxAmount: number;
    totalAmount: number;
    goodsType?: "physical-goods" | "digital-goods";
    pix: { code: string; merchantName: string; key: string; keyType: string };
}

interface PaymentOrderResponse {
    dispatch: { id: string };
    payment_order: { reference_id: string; total_amount: number };
    duplicate: boolean;
}

export interface PaymentOrderResult {
    id: string;
    duplicate: boolean;
}

export function dispatchPaymentOrder(
    apiKey: string,
    input: DispatchPaymentOrderInput,
    reporter?: ExternalApiCallReporter,
): Promise<PaymentOrderResult> {
    return bippaMessagingRequest<PaymentOrderResponse>(
        "POST",
        `${baseUrl()}/v1/payment-orders`,
        {
            service: "bippa-messaging",
            apiKey,
            jsonBody: {
                source_reference: input.sourceReference,
                seller_reference: input.sellerReference,
                recipient: input.to,
                idempotency_key: input.idempotencyKey,
                reference_id: input.referenceId,
                goods_type: input.goodsType ?? "physical-goods",
                payment: {
                    methods: [
                        {
                            type: "pix_dynamic_code",
                            pix_dynamic_code: {
                                code: input.pix.code,
                                merchant_name: input.pix.merchantName,
                                key: input.pix.key,
                                key_type: input.pix.keyType,
                            },
                        },
                    ],
                },
                items: input.items.map((item) => ({
                    retailer_id: item.retailerId,
                    name: item.name,
                    unit_amount: item.unitAmount,
                    quantity: item.quantity,
                })),
                tax_amount: input.taxAmount,
                total_amount: input.totalAmount,
            },
            operation: "dispatchPaymentOrder",
            reporter,
        },
    ).then((response) => ({
        id: response.dispatch.id,
        duplicate: response.duplicate,
    }));
}
