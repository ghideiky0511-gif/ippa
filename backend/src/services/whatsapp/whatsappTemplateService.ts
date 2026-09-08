import { z } from "zod";
import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import { errorMeta, logger } from "@/lib/logger";
import type { AuthUser } from "@/lib/types";
import { getApiKey } from "@/messaging/bippaAuthClient";
import * as bippaMessagingClient from "@/messaging/bippaMessagingClient";
import { findWhatsAppConnectionBySeller } from "@/models/whatsappConnectionsModel";
import { recordAuditEvent, WHATSAPP_INTEGRATION_AUDIT_ACTIONS, type AuditRequestContext } from "@/services/audit";
import { requireSettingsAdministrator } from "@/services/settings/settingsAuthorization";
import { ValidationError } from "@/services/shared/errors";
import { hasActiveWhatsAppConnection } from "./whatsappNotificationService";
import { mapBippaMessagingError } from "./whatsappServiceErrors";
import {
    STANDARD_WHATSAPP_TEMPLATES,
    standardWhatsAppTemplate,
    WhatsAppTemplateKeySchema,
} from "./whatsappTemplates";

const SubmitTemplateSchema = z.object({
    sellerId: z.string().trim().min(1),
    templateKey: WhatsAppTemplateKeySchema,
}).strict();

export function listStandardWhatsAppTemplates(user: AuthUser) {
    requireSettingsAdministrator(user);
    return STANDARD_WHATSAPP_TEMPLATES;
}

export async function submitStandardWhatsAppTemplate(
    tenant: Tenant,
    user: AuthUser,
    input: unknown,
    context: AuditRequestContext,
) {
    requireSettingsAdministrator(user);
    const parsed = SubmitTemplateSchema.safeParse(input);
    if (!parsed.success) {
        throw new ValidationError("INVALID_INPUT", "Template ou conexão inválidos.", parsed.error.issues);
    }

    const connection = await withTenantTransaction(tenant, user, (client) =>
        findWhatsAppConnectionBySeller(client, parsed.data.sellerId),
    );
    if (!hasActiveWhatsAppConnection(connection)) {
        throw new ValidationError(
            "WHATSAPP_NOT_CONNECTED",
            "Conecte o WhatsApp da vendedora antes de cadastrar templates.",
        );
    }

    const definition = standardWhatsAppTemplate(parsed.data.templateKey);
    let submitted;
    try {
        submitted = await bippaMessagingClient.createMessageTemplate(getApiKey(), connection.phone_id!, {
            sourceReference: connection.external_reference,
            senderProfile: connection.sender_profile_key,
            name: definition.name,
            category: definition.category,
            languageCode: definition.languageCode,
            body: definition.body,
            bodyExamples: definition.parameters.map((parameter) => parameter.example),
        });
    } catch (exc) {
        logger.error("whatsapp-template", "Falha ao cadastrar template no WABA", {
            tenantId: tenant.id,
            sellerId: parsed.data.sellerId,
            templateKey: definition.key,
            ...errorMeta(exc),
        });
        throw mapBippaMessagingError(
            exc,
            "WHATSAPP_TEMPLATE_SUBMISSION_FAILED",
            "Não foi possível enviar o template para aprovação da Meta.",
        );
    }

    await withTenantTransaction(tenant, user, (client) =>
        recordAuditEvent(client, {
            action: WHATSAPP_INTEGRATION_AUDIT_ACTIONS.TEMPLATE_SUBMITTED,
            entityId: connection.id,
            actor: user,
            context,
            metadata: {
                sellerId: parsed.data.sellerId,
                templateKey: definition.key,
                templateName: submitted.name,
                templateId: submitted.id,
                status: submitted.status,
            },
        }),
    );

    logger.info("whatsapp-template", "Template enviado para aprovação da Meta", {
        tenantId: tenant.id,
        sellerId: parsed.data.sellerId,
        templateKey: definition.key,
        templateId: submitted.id,
        status: submitted.status,
    });
    return { key: definition.key, ...submitted };
}
