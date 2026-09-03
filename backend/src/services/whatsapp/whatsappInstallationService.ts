import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser } from "@/lib/types";
import { getApiKey } from "@/messaging/bippaAuthClient";
import * as bippaMessagingClient from "@/messaging/bippaMessagingClient";
import { findUserRowById } from "@/models/usersModel";
import { requireSettingsAdministrator } from "@/services/settings/settingsAuthorization";
import { ValidationError } from "@/services/shared/errors";
import { errorMeta, logger } from "@/lib/logger";
import { externalReferenceForSeller, mapBippaMessagingError } from "./whatsappServiceErrors";

async function requireSellerInTenant(tenant: Tenant, user: AuthUser, sellerId: string) {
    const seller = await withTenantTransaction(tenant, user, (client) => findUserRowById(client, sellerId));
    if (!seller || seller.role !== "vendedora") {
        throw new ValidationError("SELLER_NOT_FOUND", "Vendedora não encontrada nesta loja.");
    }
    return seller;
}

// Passo prévio ao onboarding: garante que a VENDEDORA tem uma instalação do
// app "bippa-catalogo" no bippa-messaging antes de abrir uma tentativa de
// Embedded Signup (ver whatsappOnboardingService.ts). O source_reference
// usado aqui precisa ser o MESMO usado depois em startOnboardingAttempt/
// associateSenderProfile (externalReferenceForSeller) -- o bippa-messaging
// resolve a instalação por (application_code, source_reference), então
// provisionar por tenant.id e depois iniciar onboarding por
// "tenantId:sellerId" resulta em "Instalacao da aplicacao nao autorizada"
// (nenhuma instalação existe para essa referência). Idempotente do lado do
// bippa-messaging -- chamar de novo para uma vendedora já instalada não deve
// dar erro. application_code não vai no body: o bippa-messaging o lê da
// própria API key autenticada.

export async function ensureWhatsAppInstallation(
    tenant: Tenant,
    user: AuthUser,
    sellerId: string,
): Promise<{ installed: boolean }> {
    requireSettingsAdministrator(user);
    const seller = await requireSellerInTenant(tenant, user, sellerId);
    const sourceReference = externalReferenceForSeller(tenant.id, sellerId);

    logger.info("whatsapp-installation", "Tentando garantir instalação do app no bippa-messaging", {
        tenantId: tenant.id,
        sellerId,
        sourceReference,
    });

    try {
        await bippaMessagingClient.ensureApplicationInstallation(getApiKey(), {
            sourceReference,
            organizationName: `${tenant.name} - ${seller.name}`,
        });
        return { installed: true };
    } catch (exc) {
        logger.error("whatsapp-installation", "Falha ao garantir instalação do app no bippa-messaging", {
            tenantId: tenant.id,
            sellerId,
            ...errorMeta(exc),
        });
        // "Pertence a outra organização" (ou qualquer outra recusa do
        // bippa-messaging) precisa virar uma mensagem clara para a
        // administradora, não um erro genérico de servidor.
        throw mapBippaMessagingError(exc, "WHATSAPP_INSTALLATION_FAILED", "Não foi possível preparar a conexão com o WhatsApp.");
    }
}
