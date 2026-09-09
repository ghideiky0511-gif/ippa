import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser } from "@/lib/types";
import { getApiKey } from "@/messaging/bippaAuthClient";
import * as bippaMessagingClient from "@/messaging/bippaMessagingClient";
import { BippaMessagingClientError } from "@/messaging/errors";
import { findUserRowById } from "@/models/usersModel";
import { upsertWhatsAppConnectionRow } from "@/models/whatsappConnectionsModel";
import {
    findWhatsAppOnboardingAttemptById,
    insertWhatsAppOnboardingAttempt,
    markWhatsAppOnboardingAttemptExpired,
    reconcileWhatsAppOnboardingAttempt as persistOnboardingAttemptReconciliation,
    type WhatsAppOnboardingAttemptRow,
} from "@/models/whatsappOnboardingAttemptsModel";
import { requireSettingsAdministrator } from "@/services/settings/settingsAuthorization";
import { NotFoundError, ValidationError } from "@/services/shared/errors";
import { errorMeta, logger } from "@/lib/logger";
import { mapBippaMessagingError, senderProfileKeyForSeller } from "./whatsappServiceErrors";

// Reescrito para o novo desenho: quem fala com a Meta é o bippa-messaging,
// não o Catálogo -- este serviço só abre uma "tentativa de onboarding"
// (Embedded Signup hospedado pelo bippa-messaging) e devolve a URL que o
// frontend abre num popup. Não troca mais `code` por token nem descobre
// waba_id/phone_number_id aqui (ver whatsappIntegrationService.ts para o
// passo seguinte, depois que o popup termina).
//
// O vínculo do NÚMERO é por VENDEDORA: é a administradora quem inicia o
// onboarding em nome de uma vendedora específica (sellerId) -- um tenant pode
// ter várias vendedoras, cada uma com seu próprio número. A ORGANIZAÇÃO no
// bippa-messaging, porém, é por TENANT (não por vendedora): todas as
// tentativas de onboarding de um mesmo tenant usam o mesmo source_reference
// (tenant.id) -- ver backend/docs/mensageria/bippa-messaging/docs/
// api-reference.md ("Modelo de dados").

async function requireSellerInTenant(tenant: Tenant, user: AuthUser, sellerId: string) {
    const seller = await withTenantTransaction(tenant, user, (client) => findUserRowById(client, sellerId));
    if (!seller || seller.role !== "vendedora") {
        throw new ValidationError("SELLER_NOT_FOUND", "Vendedora não encontrada nesta loja.");
    }
    return seller;
}

const APPLICATION_CODE = "bippa-catalogo";
const DESTINATION_KEY = "catalogo-whatsapp-settings";

export interface WhatsAppOnboardingAttempt {
    attemptId: string;
    connectUrl: string;
    state: string;
    expiresAt: string;
    sdk: bippaMessagingClient.OnboardingSdkConfig;
}

// Chamado pelo frontend depois de ensureWhatsAppInstallation e antes de
// abrir o popup do Embedded Signup -- persiste a tentativa localmente
// (whatsapp_onboarding_attempts, status=pending) e devolve ao navegador só o
// necessário para abrir o popup e concluir o handshake do postMessage
// (attempt_id, connect_url, state, expires_at, config pública do SDK) --
// NUNCA a API key nem qualquer credencial da Meta.
export async function startWhatsAppOnboarding(
    tenant: Tenant,
    user: AuthUser,
    sellerId: string,
): Promise<WhatsAppOnboardingAttempt> {
    requireSettingsAdministrator(user);
    await requireSellerInTenant(tenant, user, sellerId);
    const senderProfileKey = senderProfileKeyForSeller(tenant.id, sellerId);
    // Organização = tenant (não mais tenant+vendedora, ver
    // whatsappInstallationService.ts) -- o source_reference usado aqui
    // precisa ser o MESMO usado em ensureWhatsAppInstallation.
    const sourceReference = tenant.id;

    logger.info("whatsapp-onboarding", "Iniciando tentativa de onboarding no bippa-messaging", {
        tenantId: tenant.id,
        sellerId,
        sourceReference,
    });

    let attempt: WhatsAppOnboardingAttempt;
    try {
        attempt = await bippaMessagingClient.startOnboardingAttempt(getApiKey(), {
            applicationCode: APPLICATION_CODE,
            sourceReference,
            actorReference: user.id,
            destinationKey: DESTINATION_KEY,
        });
    } catch (exc) {
        logger.error("whatsapp-onboarding", "Falha ao iniciar tentativa de onboarding no bippa-messaging", {
            tenantId: tenant.id,
            sellerId,
            ...errorMeta(exc),
        });
        throw mapBippaMessagingError(exc, "WHATSAPP_ONBOARDING_FAILED", "Não foi possível iniciar a conexão com o WhatsApp.");
    }

    // NUNCA incluir `state` aqui (nem em nenhum outro log/analytics/banco) --
    // é a credencial de uso único do popup, entregue ao frontend uma vez só,
    // via o retorno desta função.
    logger.info("whatsapp-onboarding", "Tentativa de onboarding aberta no bippa-messaging", {
        tenantId: tenant.id,
        sellerId,
        attemptId: attempt.attemptId,
        expiresAt: attempt.expiresAt,
    });

    await withTenantTransaction(tenant, user, async (client) => {
        await upsertWhatsAppConnectionRow(client, {
            tenantId: tenant.id,
            sellerId,
            // sender_profiles.external_reference no bippa-messaging é
            // sempre a vendedora pura (ver associateWhatsAppSenderProfile em
            // whatsappIntegrationService.ts) -- o espelho local segue o
            // mesmo valor, nunca mais um composto tenant:seller.
            externalReference: sellerId,
            senderProfileKey,
        });
        await insertWhatsAppOnboardingAttempt(client, {
            attemptId: attempt.attemptId,
            sellerId,
            sourceReference,
            destinationKey: DESTINATION_KEY,
            expiresAt: new Date(attempt.expiresAt),
        });
    });

    return attempt;
}

export interface WhatsAppOnboardingAttemptStatus {
    attemptId: string;
    sellerId: string;
    status: string;
    errorCode: string | null;
    errorMessage: string | null;
    expiresAt: string;
    phones: bippaMessagingClient.OnboardingAttemptPhone[];
}

function toAttemptStatus(row: WhatsAppOnboardingAttemptRow): WhatsAppOnboardingAttemptStatus {
    return {
        attemptId: row.id,
        sellerId: row.seller_id,
        status: row.status,
        errorCode: row.error_code,
        errorMessage: row.error_message,
        expiresAt: row.expires_at.toISOString(),
        phones: row.result?.phones.map((phone) => ({
            id: phone.id,
            phoneNumberId: phone.phone_number_id,
            displayPhoneNumber: phone.display_phone_number,
            verifiedName: phone.verified_name,
            qualityRating: phone.quality_rating,
            active: phone.active,
        })) ?? [],
    };
}

// Rota de status do Catálogo (ver
// app/api/[tenantSlug]/admin/whatsapp/onboarding-attempts/[attemptId]) --
// única fonte de verdade sobre uma tentativa. `attemptId` vem da URL, mas o
// `source_reference` usado para consultar o bippa-messaging é SEMPRE
// derivado da própria linha local (tenant+seller já resolvidos por
// findWhatsAppOnboardingAttemptById, que só encontra linhas do tenant
// autenticado via RLS) -- nunca de um valor informado pelo navegador, então
// uma administradora não consegue reconciliar a tentativa de outro tenant
// mesmo sabendo o attemptId.
export async function reconcileWhatsAppOnboardingAttempt(
    tenant: Tenant,
    user: AuthUser,
    attemptId: string,
): Promise<WhatsAppOnboardingAttemptStatus> {
    requireSettingsAdministrator(user);

    const existing = await withTenantTransaction(tenant, user, (client) =>
        findWhatsAppOnboardingAttemptById(client, attemptId),
    );
    if (!existing) {
        throw new NotFoundError("WHATSAPP_ONBOARDING_ATTEMPT_NOT_FOUND", "Tentativa de conexão não encontrada.");
    }

    // Estado final: repetir a consulta ao bippa-messaging não muda nada e só
    // gasta uma chamada de rede -- devolve o que já está persistido.
    if (["completed", "failed", "expired"].includes(existing.status)) {
        return toAttemptStatus(existing);
    }

    // Expirou desde a última consulta -- não vale a pena perguntar ao
    // bippa-messaging, a resposta seria a mesma.
    if (existing.expires_at.getTime() <= Date.now()) {
        const expired = await withTenantTransaction(tenant, user, (client) =>
            markWhatsAppOnboardingAttemptExpired(client, attemptId),
        );
        return toAttemptStatus(expired);
    }

    let remote: bippaMessagingClient.OnboardingAttemptStatus;
    try {
        remote = await bippaMessagingClient.getOnboardingAttempt(getApiKey(), attemptId, existing.source_reference);
    } catch (exc) {
        // 404 do bippa-messaging para este (attempt_id, source_reference) é
        // "tentativa ausente ou de outro tenant" -- diferente de qualquer
        // outro 4xx/5xx, que é erro de contrato/transporte e NÃO deve virar
        // "onboarding_rejected" (a Meta não recusou nada, a chamada é que
        // falhou). Mantém o status local anterior nesses casos, para o
        // frontend tentar de novo com backoff em vez de mostrar erro
        // definitivo.
        if (exc instanceof BippaMessagingClientError && exc.statusCode === 404) {
            logger.warn("whatsapp-onboarding", "Tentativa não encontrada no bippa-messaging ao reconciliar", {
                tenantId: tenant.id,
                attemptId,
            });
            throw new NotFoundError("WHATSAPP_ONBOARDING_ATTEMPT_NOT_FOUND", "Tentativa de conexão não encontrada.");
        }
        logger.error("whatsapp-onboarding", "Falha ao reconciliar tentativa de onboarding no bippa-messaging", {
            tenantId: tenant.id,
            attemptId,
            ...errorMeta(exc),
        });
        // Mantém o estado local anterior -- não é seguro assumir falha
        // definitiva a partir de um erro de rede/5xx transitório.
        return toAttemptStatus(existing);
    }

    const updated = await withTenantTransaction(tenant, user, (client) =>
        persistOnboardingAttemptReconciliation(client, attemptId, {
            status: remote.status,
            errorCode: remote.errorCode,
            errorMessage: remote.errorMessage,
            result: remote.result
                ? {
                      connection: {
                          id: remote.result.connection.id,
                          waba_id: remote.result.connection.wabaId,
                          status: remote.result.connection.status,
                          expires_at: remote.result.connection.expiresAt,
                          owner_business_id: remote.result.connection.ownerBusinessId,
                          granted_scopes: remote.result.connection.grantedScopes,
                      },
                      phones: remote.result.phones.map((phone) => ({
                          id: phone.id,
                          phone_number_id: phone.phoneNumberId,
                          display_phone_number: phone.displayPhoneNumber,
                          verified_name: phone.verifiedName,
                          quality_rating: phone.qualityRating,
                          active: phone.active,
                      })),
                  }
                : null,
            consumedAt: remote.consumedAt ? new Date(remote.consumedAt) : null,
            completedAt: remote.completedAt ? new Date(remote.completedAt) : null,
        }),
    );

    return toAttemptStatus(updated);
}
