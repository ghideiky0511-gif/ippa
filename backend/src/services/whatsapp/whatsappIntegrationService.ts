import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser } from "@/lib/types";
import {
    activateWhatsAppIntegrationRow,
    deactivateWhatsAppIntegrationRow,
    findActiveWhatsAppIntegrationRowBySellerId,
    findWhatsAppIntegrationRowBySellerId,
    listWhatsAppIntegrationsForTenant,
    type SellerWhatsAppIntegrationRow,
    type WhatsAppIntegrationListEntry,
} from "@/models/sellerWhatsappIntegrationsModel";
import {
    recordAuditEvent,
    WHATSAPP_INTEGRATION_AUDIT_ACTIONS,
    type AuditRequestContext,
} from "@/services/audit";
import { requireSettingsAdministrator } from "@/services/settings/settingsAuthorization";
import { ForbiddenError, ValidationError } from "@/services/shared/errors";
import { sendTemplateMessage } from "@/whatsapp/client";
import { WhatsAppClientError } from "@/whatsapp/errors";
import { toWaId } from "@/whatsapp/payloadBuilders";
import { errorMeta, logger } from "@/lib/logger";

// Espelha payments/paymentIntegrationService.ts, mas escopado à vendedora
// autenticada em vez de a um provider do tenant (ver models/
// sellerWhatsappIntegrationsModel.ts e a decisão de design no plano).

export interface WhatsAppIntegrationStatusOption {
    connected: boolean;
    active: boolean;
    displayPhoneNumber: string | null;
    status: SellerWhatsAppIntegrationRow["status"] | "not_connected";
    templatesApproved: boolean;
    lastError: string | null;
    updatedAt: string | null;
}

function requireSellerCapable(user: AuthUser): void {
    if (user.role !== "vendedora" && user.role !== "administrador") throw new ForbiddenError();
}

function toStatusOption(row: SellerWhatsAppIntegrationRow | null): WhatsAppIntegrationStatusOption {
    if (!row) {
        return {
            connected: false,
            active: false,
            displayPhoneNumber: null,
            status: "not_connected",
            templatesApproved: false,
            lastError: null,
            updatedAt: null,
        };
    }
    return {
        connected: row.status === "connected",
        active: row.active,
        displayPhoneNumber: row.display_phone_number,
        status: row.status,
        templatesApproved: row.credentials_meta.templatesApproved ?? false,
        lastError: row.last_error,
        updatedAt: row.updated_at.toISOString(),
    };
}

// Status da própria integração da vendedora autenticada.
export async function getMyWhatsAppIntegration(tenant: Tenant, user: AuthUser): Promise<WhatsAppIntegrationStatusOption> {
    requireSellerCapable(user);
    const row = await withTenantTransaction(tenant, user, (client) => findWhatsAppIntegrationRowBySellerId(client, user.id));
    return toStatusOption(row);
}

export async function activateMyWhatsAppIntegration(
    tenant: Tenant,
    user: AuthUser,
    context: AuditRequestContext,
): Promise<WhatsAppIntegrationStatusOption> {
    requireSellerCapable(user);
    return withTenantTransaction(tenant, user, async (client) => {
        const row = await activateWhatsAppIntegrationRow(client, user.id);
        if (!row) throw new ValidationError("WHATSAPP_INTEGRATION_NOT_CONNECTED", "Conecte um número de WhatsApp antes de ativá-lo.");
        await recordAuditEvent(client, {
            action: WHATSAPP_INTEGRATION_AUDIT_ACTIONS.ACTIVATED,
            entityId: row.id,
            actor: user,
            context,
        });
        return toStatusOption(row);
    });
}

export async function deactivateMyWhatsAppIntegration(
    tenant: Tenant,
    user: AuthUser,
    context: AuditRequestContext,
): Promise<WhatsAppIntegrationStatusOption> {
    requireSellerCapable(user);
    return withTenantTransaction(tenant, user, async (client) => {
        const row = await deactivateWhatsAppIntegrationRow(client, user.id);
        if (row) {
            await recordAuditEvent(client, {
                action: WHATSAPP_INTEGRATION_AUDIT_ACTIONS.DEACTIVATED,
                entityId: row.id,
                actor: user,
                context,
            });
        }
        return toStatusOption(row);
    });
}

// Manda o template order_confirmed com dados fictícios para `toE164Phone` --
// forma direta de a vendedora confirmar que o número está mesmo entregando
// mensagens antes de contar com ele em produção. Nunca lança por falha da
// Meta -- sempre devolve { ok, message }, mesmo raciocínio de
// testTenantPaymentIntegrationConnection.
export async function testMyWhatsAppIntegration(
    tenant: Tenant,
    user: AuthUser,
    toE164Phone: string,
): Promise<{ ok: boolean; message?: string }> {
    requireSellerCapable(user);
    const row = await withTenantTransaction(tenant, user, (client) => findActiveWhatsAppIntegrationRowBySellerId(client, user.id));
    if (!row || !row.access_token || !row.phone_number_id) {
        return { ok: false, message: "Conecte e ative um número de WhatsApp antes de testar o envio." };
    }
    try {
        await sendTemplateMessage(row.phone_number_id, row.access_token, {
            to: toWaId(toE164Phone),
            templateName: "order_confirmed",
            languageCode: "pt_BR",
            bodyParameters: [
                { type: "text", text: user.name },
                { type: "text", text: "0000" },
                { type: "text", text: "R$ 0,00" },
                { type: "text", text: `${tenant.name} (teste)` },
            ],
        });
        return { ok: true };
    } catch (exc) {
        logger.warn("whatsapp-integration-test", "Envio de teste falhou", { tenantId: tenant.id, sellerId: user.id, ...errorMeta(exc) });
        return { ok: false, message: exc instanceof WhatsAppClientError ? exc.message : "Falha desconhecida ao enviar o teste." };
    }
}

// Visão gerencial: todas as vendedoras do tenant e status de conexão de
// cada uma -- não expõe token nem permite ativar/desativar em nome de
// outra vendedora (cada uma mexe só na própria, ver funções acima).
export async function listWhatsAppIntegrationsForAdministrator(
    tenant: Tenant,
    user: AuthUser,
): Promise<WhatsAppIntegrationListEntry[]> {
    requireSettingsAdministrator(user);
    return withTenantTransaction(tenant, user, (client) => listWhatsAppIntegrationsForTenant(client));
}
