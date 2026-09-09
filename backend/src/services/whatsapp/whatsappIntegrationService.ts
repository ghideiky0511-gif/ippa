import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser } from "@/lib/types";
import { getApiKey } from "@/messaging/bippaAuthClient";
import * as bippaMessagingClient from "@/messaging/bippaMessagingClient";
import { findUserRowById } from "@/models/usersModel";
import {
    listWhatsAppConnectionsByTenant,
    updateWhatsAppConnectionAfterAssociation,
    type WhatsAppConnectionRow,
} from "@/models/whatsappConnectionsModel";
import { listPendingWhatsAppOnboardingAttemptsByTenant } from "@/models/whatsappOnboardingAttemptsModel";
import {
    recordAuditEvent,
    WHATSAPP_INTEGRATION_AUDIT_ACTIONS,
    type AuditRequestContext,
} from "@/services/audit";
import { requireSettingsAdministrator } from "@/services/settings/settingsAuthorization";
import { ValidationError } from "@/services/shared/errors";
import { errorMeta, logger } from "@/lib/logger";
import { mapBippaMessagingError, senderProfileKeyForSeller } from "./whatsappServiceErrors";

// Reescrito para o novo desenho: proxy fino sobre bippaMessagingClient +
// espelho local em whatsapp_connections. Escopo é a VENDEDORA (sellerId),
// dentro de um tenant administrado por quem chama (via
// requireSettingsAdministrator) -- é a administradora quem conecta o número
// em nome da vendedora, não a própria vendedora autenticada.

async function requireSellerInTenant(
    tenant: Tenant,
    user: AuthUser,
    sellerId: string,
) {
    const seller = await withTenantTransaction(tenant, user, (client) =>
        findUserRowById(client, sellerId),
    );
    if (!seller || seller.role !== "vendedora") {
        throw new ValidationError(
            "SELLER_NOT_FOUND",
            "Vendedora não encontrada nesta loja.",
        );
    }
    return seller;
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

// Lista os telefones já conectados à organização deste TENANT no
// bippa-messaging -- a administradora escolhe um para associar ao sender
// profile de uma vendedora (ver associateWhatsAppSenderProfile). A rota do
// bippa-messaging não filtra por vendedora no servidor (devolve todos os
// telefones da organização/tenant, ver
// backend/docs/mensageria/bippa-messaging/docs/api-reference.md, seção
// "Conexões, números e perfis de envio") -- por isso filtramos aqui,
// comparando `external_reference` (nunca `sender_profile_key`, que é chave
// interna do bippa-messaging) com `sellerId`. Sem esse filtro local, uma
// vendedora veria telefones já associados a outra vendedora do mesmo tenant.
// Nunca expõe token nem qualquer credencial da Meta -- essas ficam só no
// bippa-messaging.
export async function getWhatsAppConnections(
    tenant: Tenant,
    user: AuthUser,
    sellerId: string,
): Promise<WhatsAppConnectionOption[]> {
    requireSettingsAdministrator(user);
    await requireSellerInTenant(tenant, user, sellerId);
    const sourceReference = tenant.id;
    // Mesmo formato do log em associateWhatsAppSenderProfile -- permite
    // comparar, linha a linha, o source_reference exato usado aqui (GET, que
    // encontra o telefone) com o usado no PATCH logo em seguida (que pode
    // devolver phone_not_found mesmo com o telefone listado aqui segundos
    // antes).
    logger.info("whatsapp-integration", "Listando conexões de WhatsApp no bippa-messaging", {
        tenantId: tenant.id,
        sellerId,
        sourceReference,
    });
    try {
        const entries = await bippaMessagingClient.listWhatsAppConnections(
            getApiKey(),
            sourceReference,
        );
        // Um telefone recém-conectado pelo Embedded Signup ainda não tem
        // sender profile nenhum (external_reference nulo) -- precisa
        // continuar aparecendo aqui pra administradora poder escolhê-lo (ver
        // WhatsAppIntegrationApp.tsx, fluxo de seleção de telefone logo após
        // o onboarding). Só exclui telefones já reivindicados por OUTRA
        // vendedora do mesmo tenant.
        return entries
            .filter((entry) => entry.externalReference === null || entry.externalReference === sellerId)
            .map((entry) => ({
                phoneId: entry.phoneId,
                phoneNumberId: entry.phoneNumberId,
                displayPhoneMasked: entry.displayPhoneMasked,
                verifiedName: entry.verifiedName,
                qualityRating: entry.qualityRating,
                active: entry.active,
                nameStatus: entry.nameStatus,
                messagingLimitTier: entry.messagingLimitTier,
                senderProfileKey: entry.senderProfileKey,
                status: entry.status,
            }));
    } catch (exc) {
        logger.error(
            "whatsapp-integration",
            "Falha ao listar conexões de WhatsApp no bippa-messaging",
            {
                tenantId: tenant.id,
                sellerId,
                ...errorMeta(exc),
            },
        );
        throw mapBippaMessagingError(
            exc,
            "WHATSAPP_CONNECTIONS_UNAVAILABLE",
            "Não foi possível consultar os telefones conectados.",
        );
    }
}

// Foto operacional dos números da organização. Diferente do espelho local em
// whatsapp_connections, esta consulta expõe os campos de saúde que a Meta
// fornece (qualidade, aprovação do nome, limite e estado LIVE) para a tela de
// configurações. `sync=true` atualiza esses campos antes de responder.
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

export async function listTenantWhatsAppPhoneHealth(
    tenant: Tenant,
    user: AuthUser,
    sync = false,
): Promise<TenantWhatsAppPhoneHealth[]> {
    requireSettingsAdministrator(user);
    try {
        const entries = await bippaMessagingClient.listWhatsAppConnections(
            getApiKey(),
            tenant.id,
            sync,
        );
        return entries.map((entry) => ({
            phoneId: entry.phoneId,
            phoneNumberId: entry.phoneNumberId,
            displayPhoneNumber: entry.displayPhoneMasked,
            verifiedName: entry.verifiedName,
            qualityRating: entry.qualityRating,
            active: entry.active,
            nameStatus: entry.nameStatus,
            platformType: entry.platformType,
            codeVerificationStatus: entry.codeVerificationStatus,
            messagingLimitTier: entry.messagingLimitTier,
            sellerId: entry.externalReference,
            capabilityPayments: entry.capabilityPayments,
            wabaId: entry.wabaId,
            connectionStatus: entry.connectionStatus,
        }));
    } catch (exc) {
        logger.error("whatsapp-integration", "Falha ao consultar a saúde dos números de WhatsApp", {
            tenantId: tenant.id,
            sync,
            ...errorMeta(exc),
        });
        throw mapBippaMessagingError(
            exc,
            "WHATSAPP_PHONE_HEALTH_UNAVAILABLE",
            "Não foi possível atualizar os dados dos números de WhatsApp.",
        );
    }
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
    // Tentativa de onboarding ainda não finalizada (pending/processing, não
    // expirada) desta vendedora, se existir -- permite a tela retomar o
    // polling de reconciliação depois de um refresh de página, sem depender
    // de nada guardado no navegador (ver
    // whatsappOnboardingService.reconcileWhatsAppOnboardingAttempt).
    pendingAttemptId: string | null;
    pendingExpiresAt: string | null;
}

function toStatus(
    sellerId: string,
    row: WhatsAppConnectionRow | null,
    pendingAttemptId: string | null = null,
    pendingExpiresAt: string | null = null,
): TenantWhatsAppConnectionStatus {
    if (!row) {
        return {
            sellerId,
            connected: false,
            phoneId: null,
            displayPhoneMasked: null,
            verifiedName: null,
            qualityRating: null,
            senderProfileKey: null,
            capabilityPayments: false,
            status: "not_connected",
            updatedAt: null,
            pendingAttemptId,
            pendingExpiresAt,
        };
    }
    return {
        sellerId,
        connected: Boolean(row.phone_id) && row.status === "connected",
        phoneId: row.phone_id,
        displayPhoneMasked: row.display_phone_masked,
        verifiedName: row.verified_name,
        qualityRating: row.quality_rating,
        senderProfileKey: row.sender_profile_key,
        capabilityPayments: row.capability_payments,
        status: row.status,
        updatedAt: row.updated_at.toISOString(),
        pendingAttemptId,
        pendingExpiresAt,
    };
}

// Estado local de todas as vendedoras deste tenant que já têm (ou tiveram)
// uma tentativa de conexão -- usado pela tela de Integrações para listar
// vendedora a vendedora sem uma chamada por vendedora, e para retomar o
// polling de uma tentativa em curso depois de um refresh de página.
export async function listTenantWhatsAppConnectionStatuses(
    tenant: Tenant,
    user: AuthUser,
): Promise<TenantWhatsAppConnectionStatus[]> {
    requireSettingsAdministrator(user);
    const [rows, pendingBySeller] = await withTenantTransaction(
        tenant,
        user,
        async (client) => [
            await listWhatsAppConnectionsByTenant(client),
            await listPendingWhatsAppOnboardingAttemptsByTenant(client),
        ],
    );
    return rows.map((row) => {
        const pending = pendingBySeller.get(row.seller_id);
        return toStatus(
            row.seller_id,
            row,
            pending?.id ?? null,
            pending?.expires_at.toISOString() ?? null,
        );
    });
}

// Vincula um telefone (já conectado à organização no bippa-messaging) ao
// sender profile desta vendedora -- capability_payments sempre false aqui
// (disponível só depois de aprovação Meta Payments, fora de escopo). A UI só
// pode mostrar "conectado" a partir do retorno confirmado desta função,
// nunca de forma otimista.
export async function associateWhatsAppSenderProfile(
    tenant: Tenant,
    user: AuthUser,
    sellerId: string,
    phoneId: string,
    context: AuditRequestContext,
): Promise<TenantWhatsAppConnectionStatus> {
    requireSettingsAdministrator(user);
    await requireSellerInTenant(tenant, user, sellerId);
    const normalizedPhoneId = phoneId?.trim();
    if (!normalizedPhoneId)
        throw new ValidationError("INVALID_INPUT", "phoneId é obrigatório.");

    // external_reference/sender_profile_key são sempre derivados do tenant
    // autenticado (route → session) + da vendedora alvo, nunca de entrada
    // externa -- garante isolamento entre tenants/vendedoras mesmo que o
    // bippa-messaging aceitasse um valor arbitrário. sourceReference
    // identifica a organização (= tenant, ver whatsappInstallationService.ts);
    // externalReference identifica o sender profile dentro dela (=
    // vendedora, sellerId puro).
    const sourceReference = tenant.id;
    const externalReference = sellerId;
    const senderProfileKey = senderProfileKeyForSeller(tenant.id, sellerId);

    // Log do valor exato de source_reference indo pro bippa-messaging --
    // gravado independente de sucesso/erro. Existe pra provar, com o wire
    // value em mãos, se um "phone_not_found" futuro é de fato o mesmo
    // source_reference que resolveu o telefone no GET
    // /v1/admin/whatsapp-connections logo antes (ver
    // getWhatsAppConnections, mesmo log) ou se diverge -- sem isso, a
    // única forma de comparar era confiar que os dois lados leem o mesmo
    // código-fonte, o que não basta se o bug estiver do lado do
    // bippa-messaging.
    logger.info("whatsapp-integration", "Associando sender profile no bippa-messaging", {
        tenantId: tenant.id,
        sellerId,
        phoneId: normalizedPhoneId,
        sourceReference,
    });

    let association;
    try {
        association = await bippaMessagingClient.associateSenderProfile(
            getApiKey(),
            normalizedPhoneId,
            {
                // source_reference precisa ser o MESMO valor usado em
                // ensureWhatsAppInstallation (tenant.id, ver
                // whatsappInstallationService.ts) -- a organização é do
                // tenant inteiro, não uma por vendedora. Usar uma referência
                // diferente aqui faz organizationForRequest não achar
                // nenhuma linha em application_installations e devolver
                // "Instalacao da aplicacao nao autorizada".
                // external_reference identifica o sender profile dentro da
                // organização -- sempre a vendedora (sellerId puro).
                sourceReference,
                externalReference,
                senderProfileKey,
                // ATENÇÃO se implementar aprovação de Meta Payments no futuro:
                // este PATCH é full-replace em sender_profiles (UPDATE SET
                // capability_payments=EXCLUDED.capability_payments no upsert
                // por external_reference, bippa-messaging), não merge. Uma
                // troca de telefone (reassociação) chamando este mesmo
                // endpoint com capabilityPayments: false vai resetar
                // silenciosamente uma aprovação já concedida -- nesse dia,
                // essa chamada precisa ler o valor atual antes de decidir o
                // que enviar aqui, em vez de hardcodar false.
                capabilityPayments: false,
            },
        );
    } catch (exc) {
        logger.error(
            "whatsapp-integration",
            "Falha ao associar sender profile no bippa-messaging",
            {
                tenantId: tenant.id,
                sellerId,
                phoneId: normalizedPhoneId,
                ...errorMeta(exc),
            },
        );
        throw mapBippaMessagingError(
            exc,
            "WHATSAPP_ASSOCIATION_FAILED",
            "Não foi possível associar este telefone à vendedora.",
        );
    }

    // PATCH .../sender-profile devolve a linha crua de sender_profiles (id,
    // phone_id, key, capability_payments, ...) -- não tem display_phone_number/
    // verified_name/quality_rating, que são colunas de phone_numbers. Busca de
    // novo na listagem de conexões para não gravar essas colunas como null no
    // espelho local; falha aqui não desfaz a associação (já confirmada no
    // bippa-messaging), só deixa os metadados em branco até a próxima consulta.
    let phoneMeta: bippaMessagingClient.WhatsAppConnectionEntry | null = null;
    try {
        const connections = await bippaMessagingClient.listWhatsAppConnections(
            getApiKey(),
            sourceReference,
        );
        phoneMeta =
            connections.find(
                (entry) => entry.phoneId === association.phoneId,
            ) ?? null;
    } catch (exc) {
        logger.error(
            "whatsapp-integration",
            "Falha ao buscar metadados do telefone após associar sender profile",
            {
                tenantId: tenant.id,
                sellerId,
                phoneId: association.phoneId,
                ...errorMeta(exc),
            },
        );
    }

    return withTenantTransaction(tenant, user, async (client) => {
        const row = await updateWhatsAppConnectionAfterAssociation(
            client,
            sellerId,
            {
                externalReference,
                phoneId: association.phoneId,
                senderProfileKey: association.senderProfileKey,
                capabilityPayments: association.capabilityPayments,
                displayPhoneMasked: phoneMeta?.displayPhoneMasked ?? null,
                verifiedName: phoneMeta?.verifiedName ?? null,
                qualityRating: phoneMeta?.qualityRating ?? null,
                status: association.status || "connected",
                // Guardados para o fluxo de templates
                // (whatsappTemplateService.ts): criar template exige o
                // waba_id da conexão, e vincular o template ao sender
                // profile exige o sender_profile_id -- nenhum dos dois
                // aparecia em nenhuma resposta antes deste ponto.
                wabaId: phoneMeta?.wabaId ?? null,
                connectionId: phoneMeta?.connectionId ?? null,
                senderProfileId: association.senderProfileId,
            },
        );
        // CONNECTED (não ACTIVATED): esta é a primeira vez que um telefone
        // fica de fato vinculado à vendedora -- espelha o significado que
        // "connected" tinha no fluxo antigo (Embedded Signup concluído).
        // Não há um passo de "ativar" distinto no novo desenho (não existe
        // mais toggle active/inactive local, ver whatsappNotificationService.ts
        // que já resolve a conexão direto pela vendedora).
        await recordAuditEvent(client, {
            action: WHATSAPP_INTEGRATION_AUDIT_ACTIONS.CONNECTED,
            entityId: row.id,
            actor: user,
            context,
            metadata: { sellerId, phoneId: row.phone_id },
        });
        return toStatus(sellerId, row);
    });
}
