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
import {
    mapBippaMessagingError,
    metaGraphErrorMeta,
    rawBippaMessagingPayload,
} from "./whatsappServiceErrors";
import {
    STANDARD_WHATSAPP_TEMPLATES,
    standardWhatsAppTemplate,
    WhatsAppTemplateKeySchema,
} from "./whatsappTemplates";

const SubmitTemplateSchema = z
    .object({
        sellerId: z.string().trim().min(1),
        templateKey: WhatsAppTemplateKeySchema,
        // Valores de exemplo por variável do corpo do template, na mesma ordem
        // de StandardWhatsAppTemplate.parameters -- a Meta exige um exemplo por
        // variável (api-reference.md, seção Templates) e rejeita a criação sem
        // isso. Quem preenche é a administradora, no momento do envio, para que
        // o exemplo reflita um caso real em vez de um placeholder genérico.
        examples: z.array(z.string().trim().min(1)).min(1),
    })
    .strict();

// Sugestões de exemplo por parâmetro que dependem da loja. Só o CAMINHO
// (sem domínio) -- o domínio já é texto estático na `url` do botão do
// template (ver PUBLIC_ORIGIN em whatsappTemplates.ts; a Meta rejeita link
// dinâmico fora de um componente BUTTONS dedicado, subcode 2388024).
function resolveTemplateExample(
    tenant: Tenant,
    parameterKey: string,
    fallback: string,
): string {
    const slug = encodeURIComponent(tenant.slug);
    if (parameterKey === "order_url") return `${slug}/pedidos/1234`;
    if (parameterKey === "payment_url") return `${slug}/pagar/exemplo`;
    return fallback;
}

export interface StandardWhatsAppTemplateMetaStatus {
    id: string;
    metaTemplateId: string | null;
    name: string;
    status: string;
    qualityScore: string | null;
    rejectionReason: string | null;
    lastSyncedAt: string | null;
}

// O catálogo é imutável e pertence ao produto. A única informação que vem da
// Meta é se o template de mesmo nome+idioma já existe na WABA selecionada e
// qual é o seu estado atual. Isso evita que a tela de configuração vire um
// editor de templates livres que o fluxo de pedidos não usa.
export async function listStandardWhatsAppTemplates(
    tenant: Tenant,
    user: AuthUser,
    sellerId?: string,
    sync = false,
) {
    requireSettingsAdministrator(user);
    const templates = STANDARD_WHATSAPP_TEMPLATES.map((template) => ({
        ...template,
        parameters: template.parameters.map((parameter) => ({
            ...parameter,
            example: resolveTemplateExample(
                tenant,
                parameter.key,
                parameter.example,
            ),
        })),
        metaTemplate: null as StandardWhatsAppTemplateMetaStatus | null,
    }));

    if (!sellerId) return templates;

    const connection = await withTenantTransaction(tenant, user, (client) =>
        findWhatsAppConnectionBySeller(client, sellerId),
    );
    if (!hasActiveWhatsAppConnection(connection) || !connection.waba_id) {
        return templates;
    }

    try {
        const metaTemplates = await bippaMessagingClient.listWabaTemplates(
            getApiKey(),
            connection.waba_id,
            tenant.id,
            sync,
        );
        return templates.map((template) => {
            const found = metaTemplates.find(
                (item) =>
                    item.name === template.name &&
                    item.language === template.languageCode,
            );
            if (!found) return template;
            return {
                ...template,
                metaTemplate: {
                    id: found.id,
                    metaTemplateId: found.metaTemplateId,
                    name: found.name,
                    status: found.status,
                    qualityScore: found.qualityScore,
                    rejectionReason: found.rejectionReason,
                    lastSyncedAt: found.lastSyncedAt,
                },
            };
        });
    } catch (exc) {
        logger.error("whatsapp-template", "Falha ao consultar status dos templates fixos", {
            tenantId: tenant.id,
            sellerId,
            sync,
            ...errorMeta(exc),
            ...metaGraphErrorMeta(exc),
            ...rawBippaMessagingPayload(exc),
        });
        throw mapBippaMessagingError(
            exc,
            "WHATSAPP_TEMPLATES_UNAVAILABLE",
            "Não foi possível consultar os templates da Meta.",
        );
    }
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
        throw new ValidationError(
            "INVALID_INPUT",
            "Template ou conexão inválidos.",
            parsed.error.issues,
        );
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
    // `examples` chega na mesma ordem de `definition.parameters` (a UI monta
    // os dois juntos, ver WhatsAppIntegrationApp.tsx) -- separar aqui por
    // `component` porque a Meta exige um `example` por componente
    // (`body_text` no BODY, `example` próprio no botão URL), nunca um único
    // array combinado.
    const bodyExamples = definition.parameters
        .map((parameter, index) => ({ parameter, example: parsed.data.examples[index] }))
        .filter(({ parameter }) => parameter.component === "body")
        .map(({ example }) => example);
    const buttonExample = definition.parameters
        .map((parameter, index) => ({ parameter, example: parsed.data.examples[index] }))
        .find(({ parameter }) => parameter.component === "button")?.example;

    let submitted;
    // Fora do `try` para permanecer visível no `catch` -- é o diagnóstico
    // nº 1 confirmado pelo bippa-messaging para o `400 invalid_request` do
    // bind: se `created.id` (o `id` LOCAL devolvido pela criação do
    // template, nunca o `meta_template_id`) vier vazio, o bind falha sem
    // pista nenhuma no nosso log anterior.
    let created: bippaMessagingClient.CreateWabaTemplateResult | undefined;
    try {
        // Fluxo real (backend/docs/mensageria/bippa-messaging/docs/
        // api-reference.md, seção "Templates"): criar o template na WABA e
        // só depois vincular ao sender profile sob a chave de negócio
        // (template_key) -- é esse vínculo que POST /v1/dispatches resolve.
        created = await bippaMessagingClient.createWabaTemplate(
            getApiKey(),
            connection.waba_id,
            {
                sourceReference: tenant.id,
                name: definition.name,
                category: definition.category,
                languageCode: definition.languageCode,
                body: definition.body,
                bodyExamples,
                button: definition.button && buttonExample
                    ? { ...definition.button, example: buttonExample }
                    : undefined,
            },
        );
        if (!created.id) {
            // Falha explícita em vez de mandar template_id vazio pro bind
            // e receber de volta um `400 invalid_request` genérico (ver
            // templates_service.js:9-13/250-258 do bippa-messaging) --
            // confirmado por eles como a causa mais provável do incidente
            // de 2026-09-09.
            throw new Error(
                `bippa-messaging não devolveu id para o template recém-criado (name=${definition.name}).`,
            );
        }
        await bippaMessagingClient.bindTemplateToSenderProfile(
            getApiKey(),
            connection.sender_profile_id,
            {
                sourceReference: tenant.id,
                templateId: created.id,
                templateKey: definition.key,
            },
        );
        submitted = created;
    } catch (exc) {
        logger.error(
            "whatsapp-template",
            "Falha ao cadastrar template no WABA",
            {
                tenantId: tenant.id,
                sellerId: parsed.data.sellerId,
                templateKey: definition.key,
                examples: parsed.data.examples,
                createdTemplateId: created?.id,
                ...errorMeta(exc),
                ...metaGraphErrorMeta(exc),
                ...rawBippaMessagingPayload(exc),
            },
        );
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

    logger.info(
        "whatsapp-template",
        "Template enviado para aprovação da Meta",
        {
            tenantId: tenant.id,
            sellerId: parsed.data.sellerId,
            templateKey: definition.key,
            templateId: submitted.id,
            status: submitted.status,
        },
    );
    return { key: definition.key, ...submitted };
}
