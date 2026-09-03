import type { Tenant } from "@/lib/db/tenant";
import type { AuthUser } from "@/lib/types";
import { getApiKey } from "@/messaging/bippaAuthClient";
import * as bippaMessagingClient from "@/messaging/bippaMessagingClient";
import { requireSettingsAdministrator } from "@/services/settings/settingsAuthorization";
import { errorMeta, logger } from "@/lib/logger";
import { mapBippaMessagingError } from "./whatsappServiceErrors";

// Passo prévio ao onboarding: garante que o tenant tem uma instalação do
// app "bippa-catalogo" no bippa-messaging antes de abrir uma tentativa de
// Embedded Signup (ver whatsappOnboardingService.ts). Idempotente do lado do
// bippa-messaging -- chamar de novo para um tenant já instalado não deve dar
// erro.
const APPLICATION_CODE = "bippa-catalogo";

export async function ensureWhatsAppInstallation(
    tenant: Tenant,
    user: AuthUser,
): Promise<{ installed: boolean }> {
    requireSettingsAdministrator(user);
    try {
        await bippaMessagingClient.ensureApplicationInstallation(getApiKey(), {
            applicationCode: APPLICATION_CODE,
            sourceReference: tenant.id,
        });
        return { installed: true };
    } catch (exc) {
        logger.error("whatsapp-installation", "Falha ao garantir instalação do app no bippa-messaging", {
            tenantId: tenant.id,
            ...errorMeta(exc),
        });
        // "Pertence a outra organização" (ou qualquer outra recusa do
        // bippa-messaging) precisa virar uma mensagem clara para a
        // administradora, não um erro genérico de servidor.
        throw mapBippaMessagingError(exc, "WHATSAPP_INSTALLATION_FAILED", "Não foi possível preparar a conexão com o WhatsApp.");
    }
}
