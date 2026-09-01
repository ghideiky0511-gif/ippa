import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser } from "@/lib/types";
import {
    createMessageTemplate,
    exchangeEmbeddedSignupCode,
    listWabaPhoneNumbers,
    subscribeAppToWaba,
} from "@/whatsapp/client";
import { WhatsAppClientError } from "@/whatsapp/errors";
import {
    completeWhatsAppOnboardingRow,
    markWhatsAppIntegrationErrorRow,
    upsertPendingWhatsAppIntegrationRow,
    type SellerWhatsAppIntegrationRow,
} from "@/models/sellerWhatsappIntegrationsModel";
import {
    recordAuditEvent,
    WHATSAPP_INTEGRATION_AUDIT_ACTIONS,
    type AuditRequestContext,
} from "@/services/audit";
import { ForbiddenError, ValidationError } from "@/services/shared/errors";
import { errorMeta, logger } from "@/lib/logger";

// Espelha erp/erpIntegrationService.ts e payments/paymentIntegrationService.ts
// no desenho (uma linha por dono da integração, credenciais cifradas), mas o
// "dono" aqui é a vendedora (seller_id), não o tenant como um todo -- ver
// decisão no plano de integração ("N números por tenant, vinculados ao
// seller"). O fluxo em si (Embedded Signup) não tem precedente no repo: é
// troca de `code` por token (OAuth-like), não um formulário de credenciais
// estáticas.

const ORDER_CONFIRMED_TEMPLATE_NAME = "order_confirmed";
const PAYMENT_LINK_TEMPLATE_NAME = "payment_link";
const TEMPLATE_LANGUAGE = "pt_BR";

function requireSellerCapable(user: AuthUser): void {
    if (user.role !== "vendedora" && user.role !== "administrador") throw new ForbiddenError();
}

function appCredentials(): { appId: string; appSecret: string } {
    const appId = process.env.WHATSAPP_APP_ID;
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (!appId || !appSecret) {
        throw new Error("WHATSAPP_APP_ID/WHATSAPP_APP_SECRET não configuradas -- necessárias para o Embedded Signup.");
    }
    return { appId, appSecret };
}

// Chamado pelo frontend antes de abrir o popup do Embedded Signup -- limpa
// um erro anterior e dá à UI um estado "pending" para mostrar enquanto a
// vendedora conclui o fluxo do lado da Meta.
export async function startWhatsAppOnboarding(
    tenant: Tenant,
    user: AuthUser,
): Promise<SellerWhatsAppIntegrationRow> {
    requireSellerCapable(user);
    return withTenantTransaction(tenant, user, (client) => upsertPendingWhatsAppIntegrationRow(client, user.id));
}

// Registra os dois templates padrão na WABA -- não lança se um deles falhar
// (a vendedora pode ter templates com esse nome já cadastrados de uma
// tentativa anterior); falha vira log, não interrompe o onboarding.
async function registerDefaultTemplates(wabaId: string, token: string): Promise<boolean> {
    const templates = [
        {
            name: ORDER_CONFIRMED_TEMPLATE_NAME,
            language: TEMPLATE_LANGUAGE,
            category: "UTILITY" as const,
            components: [
                {
                    type: "BODY" as const,
                    text: "Olá {{1}}! Seu pedido nº {{2}} foi confirmado, total de {{3}}. Acompanhe em {{4}}.",
                },
            ],
        },
        {
            name: PAYMENT_LINK_TEMPLATE_NAME,
            language: TEMPLATE_LANGUAGE,
            category: "UTILITY" as const,
            components: [
                { type: "BODY" as const, text: "Olá {{1}}! Aqui está o link de pagamento do seu pedido: {{2}}." },
            ],
        },
    ];
    let allAccepted = true;
    for (const template of templates) {
        try {
            await createMessageTemplate(wabaId, token, template);
        } catch (exc) {
            allAccepted = false;
            logger.warn("whatsapp-onboarding", "Falha ao registrar message template", {
                wabaId,
                template: template.name,
                ...errorMeta(exc),
            });
        }
    }
    return allAccepted;
}

// Troca o `code` do Embedded Signup por token, descobre o número conectado
// e ativa a integração da vendedora autenticada. O frontend recebe `code` e
// `wabaId` do callback do JS SDK do Embedded Signup (ambos vêm no evento
// `WA_EMBEDDED_SIGNUP` -- ver
// developers.facebook.com/docs/whatsapp/embedded-signup) e manda os dois
// para cá. Nunca lança por falha na Meta sem antes marcar a linha como
// 'error' -- a UI precisa saber o que aconteceu.
export async function completeWhatsAppOnboarding(
    tenant: Tenant,
    user: AuthUser,
    input: { code: string; wabaId: string },
    context: AuditRequestContext,
): Promise<SellerWhatsAppIntegrationRow> {
    requireSellerCapable(user);
    const code = input.code?.trim();
    const wabaId = input.wabaId?.trim();
    if (!code) throw new ValidationError("INVALID_INPUT", "code do Embedded Signup é obrigatório.");
    if (!wabaId) throw new ValidationError("INVALID_INPUT", "wabaId é obrigatório.");
    const app = appCredentials();

    try {
        const tokenResponse = await exchangeEmbeddedSignupCode(code, app);
        const token = tokenResponse.access_token;

        const phoneNumbers = await listWabaPhoneNumbers(wabaId, token);
        const phoneNumber = phoneNumbers.data[0];
        if (!phoneNumber) {
            throw new ValidationError(
                "WHATSAPP_NO_PHONE_NUMBER",
                "Nenhum número de telefone encontrado nessa conta do WhatsApp Business.",
            );
        }

        await subscribeAppToWaba(wabaId, token).catch((exc) => {
            // Não é fatal para a conexão em si -- sem a inscrição só os
            // recibos de entrega/leitura deixam de chegar (ver
            // internal/whatsapp/webhook/route.ts), o envio continua funcionando.
            logger.warn("whatsapp-onboarding", "Falha ao inscrever o app para receber webhooks da WABA", {
                wabaId,
                ...errorMeta(exc),
            });
        });

        const templatesApproved = await registerDefaultTemplates(wabaId, token);

        const row = await withTenantTransaction(tenant, user, async (client) => {
            const saved = await completeWhatsAppOnboardingRow(client, {
                sellerId: user.id,
                wabaId,
                phoneNumberId: phoneNumber.id,
                displayPhoneNumber: phoneNumber.display_phone_number,
                accessToken: token,
                credentialsMeta: { templatesApproved },
            });
            await recordAuditEvent(client, {
                action: WHATSAPP_INTEGRATION_AUDIT_ACTIONS.CONNECTED,
                entityId: saved.id,
                actor: user,
                context,
                metadata: { phoneNumberId: saved.phone_number_id },
            });
            return saved;
        });
        return row;
    } catch (exc) {
        if (exc instanceof ValidationError) throw exc;
        const message = exc instanceof WhatsAppClientError ? exc.message : "Falha ao concluir a conexão com o WhatsApp.";
        await withTenantTransaction(tenant, user, (client) => markWhatsAppIntegrationErrorRow(client, user.id, message));
        logger.error("whatsapp-onboarding", "Falha ao concluir onboarding do WhatsApp", { tenantId: tenant.id, ...errorMeta(exc) });
        throw new ValidationError("WHATSAPP_ONBOARDING_FAILED", message);
    }
}
