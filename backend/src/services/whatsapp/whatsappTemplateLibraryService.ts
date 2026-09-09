import { z } from "zod";
import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import { errorMeta, logger } from "@/lib/logger";
import type { AuthUser } from "@/lib/types";
import { getApiKey } from "@/messaging/bippaAuthClient";
import * as bippaMessagingClient from "@/messaging/bippaMessagingClient";
import { findWhatsAppConnectionBySeller } from "@/models/whatsappConnectionsModel";
import {
    recordAuditEvent,
    WHATSAPP_INTEGRATION_AUDIT_ACTIONS,
    type AuditRequestContext,
} from "@/services/audit";
import { requireSettingsAdministrator } from "@/services/settings/settingsAuthorization";
import { ValidationError } from "@/services/shared/errors";
import { hasActiveWhatsAppConnection } from "./whatsappNotificationService";
import { mapBippaMessagingError } from "./whatsappServiceErrors";

const SellerInputSchema = z.object({ sellerId: z.string().trim().min(1) }).strict();
const CreateInputSchema = SellerInputSchema.extend({
    name: z.string().trim().regex(/^[a-z0-9_]+$/, "Use apenas letras minúsculas, números e _."),
    language: z.string().trim().regex(/^[a-z]{2,3}(?:_[A-Z]{2})?$/),
    category: z.enum(["UTILITY", "MARKETING", "AUTHENTICATION"]),
    body: z.string().trim().min(1),
    examples: z.array(z.string().trim().min(1)),
}).strict();

async function connectedWaba(tenant: Tenant, user: AuthUser, sellerId: string) {
    const connection = await withTenantTransaction(tenant, user, (client) =>
        findWhatsAppConnectionBySeller(client, sellerId),
    );
    if (!hasActiveWhatsAppConnection(connection) || !connection.waba_id) {
        throw new ValidationError(
            "WHATSAPP_NOT_CONNECTED",
            "Conecte o WhatsApp da vendedora antes de administrar templates.",
        );
    }
    return connection;
}

function templateComponents(body: string, examples: string[]) {
    const variables = [...body.matchAll(/\{\{\d+\}\}/g)];
    if (examples.length !== variables.length) {
        throw new ValidationError(
            "INVALID_INPUT",
            variables.length === 0
                ? "Este template não usa variáveis; deixe os exemplos vazios."
                : "Informe um exemplo para cada variável do texto.",
        );
    }
    return [{
        type: "BODY",
        text: body,
        ...(variables.length > 0 ? { example: { body_text: [examples] } } : {}),
    }];
}

export async function listWhatsAppTemplateLibrary(
    tenant: Tenant,
    user: AuthUser,
    input: unknown,
    sync = true,
) {
    requireSettingsAdministrator(user);
    const parsed = SellerInputSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError("INVALID_INPUT", "Vendedora inválida.");
    const connection = await connectedWaba(tenant, user, parsed.data.sellerId);
    try {
        return await bippaMessagingClient.listWabaTemplates(
            getApiKey(),
            connection.waba_id!,
            tenant.id,
            sync,
        );
    } catch (exc) {
        logger.error("whatsapp-template-library", "Falha ao listar templates", {
            tenantId: tenant.id, sellerId: parsed.data.sellerId, ...errorMeta(exc),
        });
        throw mapBippaMessagingError(exc, "WHATSAPP_TEMPLATES_UNAVAILABLE", "Não foi possível carregar os templates da Meta.");
    }
}

export async function createWhatsAppTemplateInLibrary(
    tenant: Tenant,
    user: AuthUser,
    input: unknown,
    context: AuditRequestContext,
) {
    requireSettingsAdministrator(user);
    const parsed = CreateInputSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError("INVALID_INPUT", "Dados do template inválidos.", parsed.error.issues);
    const connection = await connectedWaba(tenant, user, parsed.data.sellerId);
    const components = templateComponents(parsed.data.body, parsed.data.examples);
    try {
        const template = await bippaMessagingClient.createWhatsAppTemplate(
            getApiKey(), connection.waba_id!, {
                sourceReference: tenant.id,
                name: parsed.data.name,
                language: parsed.data.language,
                category: parsed.data.category,
                components,
            },
        );
        await withTenantTransaction(tenant, user, (client) => recordAuditEvent(client, {
            action: WHATSAPP_INTEGRATION_AUDIT_ACTIONS.TEMPLATE_SUBMITTED,
            entityId: connection.id,
            actor: user,
            context,
            metadata: { sellerId: parsed.data.sellerId, templateId: template.id, templateName: template.name },
        }));
        return template;
    } catch (exc) {
        logger.error("whatsapp-template-library", "Falha ao criar template", {
            tenantId: tenant.id, sellerId: parsed.data.sellerId, name: parsed.data.name, ...errorMeta(exc),
        });
        throw mapBippaMessagingError(exc, "WHATSAPP_TEMPLATE_SUBMISSION_FAILED", "Não foi possível enviar o template para análise da Meta.");
    }
}

export async function inspectWhatsAppTemplateInLibrary(
    tenant: Tenant,
    user: AuthUser,
    sellerId: string,
    templateId: string,
) {
    requireSettingsAdministrator(user);
    const connection = await connectedWaba(tenant, user, sellerId);
    try {
        const template = await bippaMessagingClient.getWhatsAppTemplate(getApiKey(), templateId, tenant.id);
        if (template.wabaId !== connection.waba_id) {
            throw new ValidationError("TEMPLATE_NOT_IN_WABA", "Este template não pertence ao número selecionado.");
        }
        return template;
    } catch (exc) {
        if (exc instanceof ValidationError) throw exc;
        throw mapBippaMessagingError(exc, "WHATSAPP_TEMPLATE_UNAVAILABLE", "Não foi possível atualizar a análise do template.");
    }
}

export async function deleteWhatsAppTemplateInLibrary(
    tenant: Tenant,
    user: AuthUser,
    sellerId: string,
    templateId: string,
    context: AuditRequestContext,
) {
    requireSettingsAdministrator(user);
    const connection = await connectedWaba(tenant, user, sellerId);
    const template = await inspectWhatsAppTemplateInLibrary(tenant, user, sellerId, templateId);
    try {
        await bippaMessagingClient.deleteWhatsAppTemplate(getApiKey(), templateId, tenant.id);
        await withTenantTransaction(tenant, user, (client) => recordAuditEvent(client, {
            action: WHATSAPP_INTEGRATION_AUDIT_ACTIONS.TEMPLATE_DELETED,
            entityId: connection.id,
            actor: user,
            context,
            metadata: { sellerId, templateId: template.id, templateName: template.name },
        }));
    } catch (exc) {
        logger.error("whatsapp-template-library", "Falha ao excluir template", {
            tenantId: tenant.id, sellerId, templateId, ...errorMeta(exc),
        });
        throw mapBippaMessagingError(exc, "WHATSAPP_TEMPLATE_DELETE_FAILED", "Não foi possível excluir o template.");
    }
}
