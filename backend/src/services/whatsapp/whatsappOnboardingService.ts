import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser } from "@/lib/types";
import { getApiKey } from "@/messaging/bippaAuthClient";
import * as bippaMessagingClient from "@/messaging/bippaMessagingClient";
import { findUserRowById } from "@/models/usersModel";
import { upsertWhatsAppConnectionRow } from "@/models/whatsappConnectionsModel";
import { requireSettingsAdministrator } from "@/services/settings/settingsAuthorization";
import { ValidationError } from "@/services/shared/errors";
import { errorMeta, logger } from "@/lib/logger";
import { externalReferenceForSeller, mapBippaMessagingError, senderProfileKeyForSeller } from "./whatsappServiceErrors";

// Reescrito para o novo desenho: quem fala com a Meta é o bippa-messaging,
// não o Catálogo -- este serviço só abre uma "tentativa de onboarding"
// (Embedded Signup hospedado pelo bippa-messaging) e devolve a URL que o
// frontend abre num popup. Não troca mais `code` por token nem descobre
// waba_id/phone_number_id aqui (ver whatsappIntegrationService.ts para o
// passo seguinte, depois que o popup termina).
//
// O vínculo é por VENDEDORA: é a administradora quem inicia o onboarding em
// nome de uma vendedora específica (sellerId), não em nome do tenant como um
// todo -- um tenant pode ter várias vendedoras, cada uma com seu próprio
// número.

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
    connectUrl: string;
    state: string;
}

// Chamado pelo frontend depois de ensureWhatsAppInstallation e antes de
// abrir o popup do Embedded Signup -- registra localmente a intenção de
// conexão (linha "not_connected" se ainda não existir) e devolve a URL/state
// que o bippa-messaging gerou para esta tentativa.
export async function startWhatsAppOnboarding(
    tenant: Tenant,
    user: AuthUser,
    sellerId: string,
): Promise<WhatsAppOnboardingAttempt> {
    requireSettingsAdministrator(user);
    await requireSellerInTenant(tenant, user, sellerId);
    const senderProfileKey = senderProfileKeyForSeller(tenant.id, sellerId);
    const externalReference = externalReferenceForSeller(tenant.id, sellerId);

    let attempt: WhatsAppOnboardingAttempt;
    try {
        attempt = await bippaMessagingClient.startOnboardingAttempt(getApiKey(), {
            applicationCode: APPLICATION_CODE,
            sourceReference: externalReference,
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

    await withTenantTransaction(tenant, user, (client) =>
        upsertWhatsAppConnectionRow(client, {
            tenantId: tenant.id,
            sellerId,
            externalReference,
            senderProfileKey,
        }),
    );

    return attempt;
}
