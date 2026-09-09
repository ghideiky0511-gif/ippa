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
    // Valores de exemplo por variável do corpo do template, na mesma ordem
    // de StandardWhatsAppTemplate.parameters -- a Meta exige um exemplo por
    // variável (api-reference.md, seção Templates) e rejeita a criação sem
    // isso. Quem preenche é a administradora, no momento do envio, para que
    // o exemplo reflita um caso real em vez de um placeholder genérico.
    examples: z.array(z.string().trim().min(1)).min(1),
}).strict();

// Sugestões de exemplo por parâmetro que dependem da loja (nunca de um
// domínio fictício como "loja.exemplo.com"). `origin` vem de
// publicOrigin(request) (whatsapp/templates/route.ts) -- o host real que a
// administradora está usando para acessar o admin nesta requisição --, não
// de APP_URL/ADMIN_ORIGIN, que fica "localhost" em ambientes sem essas
// variáveis configuradas (ver orderDetailsLink/orderPaymentLink em
// emailNotificationService.ts, usadas nos e-mails reais de pedido/pagamento,
// que rodam fora de uma requisição HTTP e por isso dependem do env).
function resolveTemplateExample(origin: string, tenant: Tenant, parameterKey: string, fallback: string): string {
    const slug = encodeURIComponent(tenant.slug);
    if (parameterKey === "order_url") return `${origin}/${slug}/pedidos/1234`;
    if (parameterKey === "payment_url") return `${origin}/${slug}/pagar/exemplo`;
    return fallback;
}

export function listStandardWhatsAppTemplates(tenant: Tenant, user: AuthUser, origin: string) {
    requireSettingsAdministrator(user);
    return STANDARD_WHATSAPP_TEMPLATES.map((template) => ({
        ...template,
        parameters: template.parameters.map((parameter) => ({
            ...parameter,
            example: resolveTemplateExample(origin, tenant, parameter.key, parameter.example),
        })),
    }));
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
    // waba_id/sender_profile_id só existem a partir desta migration (ver
    // 066_whatsapp_connection_metadata.sql) -- uma conexão associada antes
    // dela ainda não tem esses campos gravados localmente.
    if (!connection.waba_id || !connection.sender_profile_id) {
        throw new ValidationError(
            "WHATSAPP_RECONNECT_REQUIRED",
            "Reconecte o WhatsApp da vendedora antes de cadastrar templates.",
        );
    }

    const definition = standardWhatsAppTemplate(parsed.data.templateKey);
    if (parsed.data.examples.length !== definition.parameters.length) {
        throw new ValidationError(
            "INVALID_INPUT",
            "Informe um exemplo para cada variável do template.",
        );
    }

    let submitted;
    try {
        // Fluxo real (backend/docs/mensageria/bippa-messaging/docs/
        // api-reference.md, seção "Templates"): criar o template na WABA e
        // só depois vincular ao sender profile sob a chave de negócio
        // (template_key) -- é esse vínculo que POST /v1/dispatches resolve.
        const created = await bippaMessagingClient.createWabaTemplate(getApiKey(), connection.waba_id, {
            sourceReference: tenant.id,
            name: definition.name,
            category: definition.category,
            languageCode: definition.languageCode,
            body: definition.body,
            bodyExamples: parsed.data.examples,
        });
        await bippaMessagingClient.bindTemplateToSenderProfile(getApiKey(), connection.sender_profile_id, {
            sourceReference: tenant.id,
            templateId: created.id,
            templateKey: definition.key,
        });
        submitted = created;
    } catch (exc) {
        logger.error("whatsapp-template", "Falha ao cadastrar template no WABA", {
            tenantId: tenant.id,
            sellerId: parsed.data.sellerId,
            templateKey: definition.key,
            examples: parsed.data.examples,
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
                examples: parsed.data.examples,
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
