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
import {
    recordAuditEvent,
    WHATSAPP_INTEGRATION_AUDIT_ACTIONS,
    type AuditRequestContext,
} from "@/services/audit";
import { requireSettingsAdministrator } from "@/services/settings/settingsAuthorization";
import { ValidationError } from "@/services/shared/errors";
import { errorMeta, logger } from "@/lib/logger";
import { externalReferenceForSeller, mapBippaMessagingError, senderProfileKeyForSeller } from "./whatsappServiceErrors";

// Reescrito para o novo desenho: proxy fino sobre bippaMessagingClient +
// espelho local em whatsapp_connections. Escopo é a VENDEDORA (sellerId),
// dentro de um tenant administrado por quem chama (via
// requireSettingsAdministrator) -- é a administradora quem conecta o número
// em nome da vendedora, não a própria vendedora autenticada.

async function requireSellerInTenant(tenant: Tenant, user: AuthUser, sellerId: string) {
    const seller = await withTenantTransaction(tenant, user, (client) => findUserRowById(client, sellerId));
    if (!seller || seller.role !== "vendedora") {
        throw new ValidationError("SELLER_NOT_FOUND", "Vendedora não encontrada nesta loja.");
    }
    return seller;
}

export interface WhatsAppConnectionOption {
    phoneId: string;
    displayPhoneMasked: string | null;
    verifiedName: string | null;
    qualityRating: string | null;
    senderProfileKey: string | null;
    status: string;
}

// Lista os telefones já conectados à organização (do lado do
// bippa-messaging) -- a administradora escolhe um para associar ao sender
// profile deste tenant (ver associateWhatsAppSenderProfile). Nunca expõe
// token nem qualquer credencial da Meta -- essas ficam só no bippa-messaging.
export async function getWhatsAppConnections(
    tenant: Tenant,
    user: AuthUser,
): Promise<WhatsAppConnectionOption[]> {
    requireSettingsAdministrator(user);
    try {
        const entries = await bippaMessagingClient.listWhatsAppConnections(getApiKey());
        return entries.map((entry) => ({
            phoneId: entry.phoneId,
            displayPhoneMasked: entry.displayPhoneMasked,
            verifiedName: entry.verifiedName,
            qualityRating: entry.qualityRating,
            senderProfileKey: entry.senderProfileKey,
            status: entry.status,
        }));
    } catch (exc) {
        logger.error("whatsapp-integration", "Falha ao listar conexões de WhatsApp no bippa-messaging", {
            tenantId: tenant.id,
            ...errorMeta(exc),
        });
        throw mapBippaMessagingError(exc, "WHATSAPP_CONNECTIONS_UNAVAILABLE", "Não foi possível consultar os telefones conectados.");
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
}

function toStatus(sellerId: string, row: WhatsAppConnectionRow | null): TenantWhatsAppConnectionStatus {
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
    };
}

// Estado local de todas as vendedoras deste tenant que já têm (ou tiveram)
// uma tentativa de conexão -- usado pela tela de Integrações para listar
// vendedora a vendedora sem uma chamada por vendedora.
export async function listTenantWhatsAppConnectionStatuses(
    tenant: Tenant,
    user: AuthUser,
): Promise<TenantWhatsAppConnectionStatus[]> {
    requireSettingsAdministrator(user);
    const rows = await withTenantTransaction(tenant, user, (client) => listWhatsAppConnectionsByTenant(client));
    return rows.map((row) => toStatus(row.seller_id, row));
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
    if (!normalizedPhoneId) throw new ValidationError("INVALID_INPUT", "phoneId é obrigatório.");

    // external_reference/sender_profile_key são sempre derivados do tenant
    // autenticado (route → session) + da vendedora alvo, nunca de entrada
    // externa -- garante isolamento entre tenants/vendedoras mesmo que o
    // bippa-messaging aceitasse um valor arbitrário.
    const externalReference = externalReferenceForSeller(tenant.id, sellerId);
    const senderProfileKey = senderProfileKeyForSeller(tenant.id, sellerId);

    let association;
    try {
        association = await bippaMessagingClient.associateSenderProfile(getApiKey(), normalizedPhoneId, {
            externalReference,
            senderProfileKey,
            capabilityPayments: false,
        });
    } catch (exc) {
        logger.error("whatsapp-integration", "Falha ao associar sender profile no bippa-messaging", {
            tenantId: tenant.id,
            sellerId,
            phoneId: normalizedPhoneId,
            ...errorMeta(exc),
        });
        throw mapBippaMessagingError(exc, "WHATSAPP_ASSOCIATION_FAILED", "Não foi possível associar este telefone à vendedora.");
    }

    return withTenantTransaction(tenant, user, async (client) => {
        const row = await updateWhatsAppConnectionAfterAssociation(client, sellerId, {
            externalReference,
            phoneId: association.phoneId,
            senderProfileKey: association.senderProfileKey,
            capabilityPayments: association.capabilityPayments,
            displayPhoneMasked: association.displayPhoneMasked,
            verifiedName: association.verifiedName,
            qualityRating: association.qualityRating,
            status: association.status || "connected",
        });
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
