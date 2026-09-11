import { createHash, randomUUID } from "node:crypto";
import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import { formatBRL } from "@/lib/format";
import { errorMeta, logger } from "@/lib/logger";
import { getApiKey } from "@/messaging/bippaAuthClient";
import * as bippaMessagingClient from "@/messaging/bippaMessagingClient";
import { toWaId } from "@/messaging/payloadBuilders";
import { findWhatsAppConnectionBySeller, type WhatsAppConnectionRow } from "@/models/whatsappConnectionsModel";
import type { ClientRow } from "@/models/clientsModel";
import { orderAccessLink } from "@/services/notifications/emailNotificationService";
import {
    createOrderAccessToken,
    discardOrderAccessToken,
    revokePreviousOrderAccessTokens,
} from "@/services/orders/orderAccessService";
import { ValidationError } from "@/services/shared/errors";
import { mapBippaMessagingError, metaGraphErrorMeta, rawBippaMessagingPayload } from "./whatsappServiceErrors";
import {
    standardWhatsAppTemplate,
    WHATSAPP_TEMPLATE_KEYS,
} from "./whatsappTemplates";

// Terceiro canal de notificação de pedido, ao lado de e-mail e push in-app
// (emailNotificationService.ts) -- não é a fase de order_details/
// order_status pagáveis dentro do WhatsApp, só confirmação de pedido e link
// de pagamento via message template comum.
//
// Reescrito para o novo desenho: a conexão é resolvida pela VENDEDORA
// (recipient.sellerId, via whatsappConnectionsModel) -- cada vendedora tem
// seu próprio número, então a mensagem só sai se a conexão DAQUELA
// vendedora estiver conectada (nunca cai para um número genérico do
// tenant). O envio passa pelo bippa-messaging com a API key de serviço do
// Catálogo (bippaAuthClient.getApiKey(), escopo messaging:write) -- não há
// token de sessão humana envolvido aqui (este código roda em background,
// sem requisição autenticada em mãos). O cadastro dos templates oficiais é
// iniciado pelo admin no Catálogo, mas a credencial e a chamada à Meta
// continuam centralizadas no bippa-messaging.
//
// Nunca lança: falha vira log e retorno silencioso, mesmo princípio do
// try/catch em notifyFirstAccessConfirmation -- e-mail/push já cobrem a
// notificação, WhatsApp aqui é estritamente aditivo.

// A interface pública (WhatsAppOrderRecipient, toWhatsAppOrderRecipient,
// sendOrderConfirmedWhatsApp, sendPaymentLinkWhatsApp) é preservada de
// propósito -- orderService/paymentService/paymentLinkService continuam
// chamando exatamente como antes, só a implementação interna mudou.
export interface WhatsAppOrderRecipient {
    whatsappPhone: string;
    sellerId: string;
    clientName: string;
}

// Único ponto que decide se um pedido/link tem para onde ir por WhatsApp --
// usado pelos três call-sites (orderService, paymentService,
// paymentLinkService) sobre o ClientRow que cada um já busca dentro da
// própria transação de checkout.
export function toWhatsAppOrderRecipient(client: ClientRow | null): WhatsAppOrderRecipient | null {
    if (!client?.whatsapp_phone || !client.last_seller_id) return null;
    return { whatsappPhone: client.whatsapp_phone, sellerId: client.last_seller_id, clientName: client.name };
}

// O gate "só conversa se a integração estiver ativa": função pura,
// testável isoladamente sem transação de banco, mesmo padrão de
// toWhatsAppOrderRecipient acima. Uma vendedora sem conexão própria
// conectada (linha ausente, sem phone_id, ou status != 'connected')
// simplesmente não tem número de WhatsApp para mandar a mensagem.
export function hasActiveWhatsAppConnection(row: WhatsAppConnectionRow | null): row is WhatsAppConnectionRow {
    return Boolean(row?.phone_id) && row?.status === "connected";
}

// Resolve pela VENDEDORA (recipient.sellerId), nunca por um número genérico
// do tenant -- cada vendedora tem sua própria conexão.
async function resolveActiveIntegration(tenant: Tenant, sellerId: string): Promise<WhatsAppConnectionRow | null> {
    return withTenantTransaction(tenant, {}, (client) => findWhatsAppConnectionBySeller(client, sellerId));
}

export async function assertWhatsAppConnectionAvailable(tenant: Tenant, sellerId: string): Promise<void> {
    const row = await resolveActiveIntegration(tenant, sellerId);
    if (!hasActiveWhatsAppConnection(row)) {
        throw new ValidationError(
            "WHATSAPP_NOT_CONNECTED",
            "A vendedora deste pedido ainda não tem um WhatsApp conectado.",
        );
    }
}

// A Meta rejeita link dinâmico fora de um botão URL dedicado (422
// meta_graph_error / subcode 2388024, confirmado em produção) -- o domínio
// já é texto estático na `url` do botão dos templates (PUBLIC_ORIGIN em
// whatsappTemplates.ts), então só o caminho (sem "https://dominio") vai
// como parâmetro do botão. `orderDetailsLink`/`orderPaymentLink` continuam
// devolvendo a URL completa (usadas também nos e-mails), então extrai-se o
// caminho aqui em vez de duplicar a lógica de montagem de URL.
function pathOnly(url: string): string {
    return new URL(url).pathname.replace(/^\//, "");
}

interface ManualWhatsAppSendLogContext {
    scope: "manual-order-whatsapp" | "manual-payment-order-whatsapp" | "manual-payment-link-whatsapp";
    kind: "order_template" | "order_details" | "payment_link_template";
    orderId: string;
}

// Os envios manuais precisam ser rastreáveis no stdout da aplicação, além do
// histórico remoto do bippa-messaging. Nunca entram aqui telefone, nome da
// cliente, link, token ou código Pix: os identificadores internos bastam para
// correlacionar uma tentativa com o pedido sem registrar dados sensíveis.
async function sendRequired(
    tenant: Tenant,
    recipient: WhatsAppOrderRecipient,
    send: (row: WhatsAppConnectionRow, apiKey: string) => Promise<{ id: string }>,
    logContext: ManualWhatsAppSendLogContext,
): Promise<{ id: string }> {
    const logMeta = {
        tenantId: tenant.id,
        sellerId: recipient.sellerId,
        orderId: logContext.orderId,
        kind: logContext.kind,
    };
    logger.info(logContext.scope, "Tentativa manual de envio pelo WhatsApp", logMeta);
    try {
        const row = await resolveActiveIntegration(tenant, recipient.sellerId);
        if (!hasActiveWhatsAppConnection(row)) {
            logger.warn(logContext.scope, "Envio manual não realizado: WhatsApp da vendedora indisponível", logMeta);
            throw new ValidationError(
                "WHATSAPP_NOT_CONNECTED",
                "A vendedora deste pedido ainda não tem um WhatsApp conectado.",
            );
        }
        const result = await send(row, getApiKey());
        logger.info(logContext.scope, "Mensagem manual enviada pelo WhatsApp", {
            ...logMeta,
            messageId: result.id,
        });
        return result;
    } catch (exc) {
        // errorMeta() só extrai o primeiro de error/error_description/message
        // do corpo -- num 400 de payment-orders isso vira só
        // "invalid_order_payload", sem dizer qual campo falhou. O motivo
        // específico só está em rawBippaMessagingPayload() (ver
        // whatsappServiceErrors.ts, mesmo padrão de whatsappTemplateService.ts).
        logger.error(logContext.scope, "Falha no envio manual pelo WhatsApp", {
            ...logMeta,
            ...errorMeta(exc),
            ...metaGraphErrorMeta(exc),
            ...rawBippaMessagingPayload(exc),
        });
        throw mapBippaMessagingError(
            exc,
            "WHATSAPP_SEND_FAILED",
            "Não foi possível enviar a mensagem pelo WhatsApp.",
        );
    }
}

async function deliver(
    tenant: Tenant,
    recipient: WhatsAppOrderRecipient,
    logScope: string,
    send: (row: WhatsAppConnectionRow, apiKey: string) => Promise<{ id: string }>,
): Promise<void> {
    const logMeta = {
        tenantId: tenant.id,
        sellerId: recipient.sellerId,
    };
    logger.info(logScope, "Tentativa automática de envio pelo WhatsApp", logMeta);
    try {
        const row = await resolveActiveIntegration(tenant, recipient.sellerId);
        if (!hasActiveWhatsAppConnection(row)) {
            logger.warn(logScope, "Envio automático não realizado: WhatsApp da vendedora indisponível", logMeta);
            return; // vendedora sem WhatsApp conectado -- e-mail/push já cobrem
        }
        const result = await send(row, getApiKey());
        logger.info(logScope, "Mensagem de WhatsApp enviada", {
            ...logMeta,
            messageId: result.id,
        });
    } catch (exc) {
        logger.error(logScope, "Falha ao enviar mensagem de WhatsApp", {
            ...logMeta,
            ...errorMeta(exc),
            ...metaGraphErrorMeta(exc),
            ...rawBippaMessagingPayload(exc),
        });
    }
}

export function sendOrderConfirmedWhatsApp(
    tenant: Tenant,
    recipient: WhatsAppOrderRecipient | null,
    order: { id: string; orderNumber: number; total: number },
): void {
    if (!recipient) return;
    const definition = standardWhatsAppTemplate(WHATSAPP_TEMPLATE_KEYS.orderConfirmed);
    void deliver(tenant, recipient, "order-confirmed-whatsapp", async (row, apiKey) => {
        const access = await createOrderAccessToken(tenant, order.id);
        const result = await bippaMessagingClient.dispatchTemplateWithUrlButton(apiKey, {
            sourceReference: tenant.id,
            sellerReference: row.external_reference,
            to: toWaId(recipient.whatsappPhone),
            // Determinístico: este disparo automático é sempre o MESMO
            // evento de negócio (pedido confirmado) -- uma repetição
            // acidental (ex.: reentrância do checkout) deve deduplicar no
            // bippa-messaging, não mandar a mensagem de novo.
            idempotencyKey: `bippa-catalogo:${tenant.id}:seller:${recipient.sellerId}:order:${order.id}:confirmed`,
            templateName: definition.name,
            languageCode: definition.languageCode,
            bodyParams: [recipient.clientName, String(order.orderNumber), formatBRL(order.total)],
            buttonParam: pathOnly(
                orderAccessLink(
                    tenant,
                    access.token,
                ),
            ),
        });
        if (result.duplicate) await discardOrderAccessToken(tenant, access.token);
        else await revokePreviousOrderAccessTokens(tenant, order.id, access.token);
        return result;
    });
}

export function sendPaymentLinkWhatsApp(
    tenant: Tenant,
    recipient: WhatsAppOrderRecipient | null,
    link: string,
    referenceId: string,
): void {
    if (!recipient) return;
    const definition = standardWhatsAppTemplate(WHATSAPP_TEMPLATE_KEYS.paymentLink);
    void deliver(tenant, recipient, "payment-link-whatsapp", async (row, apiKey) => {
        const result = await bippaMessagingClient.dispatchTemplateWithUrlButton(apiKey, {
            sourceReference: tenant.id,
            sellerReference: row.external_reference,
            to: toWaId(recipient.whatsappPhone),
            idempotencyKey: paymentLinkIdempotencyKey(tenant.id, recipient.sellerId, referenceId),
            templateName: definition.name,
            languageCode: definition.languageCode,
            bodyParams: [recipient.clientName],
            buttonParam: pathOnly(link),
        });
        return result;
    });
}

// `referenceId` é o token de pagamento (já único por link gerado) -- vira a
// idempotency key junto com tenant/vendedora, como a doc do bippa-messaging
// pede ("deve incluir tenant, vendedor, entidade de negócio e evento").
function paymentLinkIdempotencyKey(tenantId: string, sellerId: string, referenceId: string): string {
    const digest = createHash("sha256").update(referenceId).digest("hex").slice(0, 16);
    return `bippa-catalogo:${tenantId}:seller:${sellerId}:payment-link:${digest}:sent`;
}

// Awaitable variants for manual workspace actions. Unlike the automatic
// notifications above, failures must reach the UI to avoid false success.
export async function sendOrderConfirmedWhatsAppNow(
    tenant: Tenant,
    recipient: WhatsAppOrderRecipient,
    order: { id: string; orderNumber: number; total: number },
): Promise<{ id: string }> {
    const definition = standardWhatsAppTemplate(WHATSAPP_TEMPLATE_KEYS.orderConfirmed);
    const result = await sendRequired(tenant, recipient, async (row, apiKey) => {
        const access = await createOrderAccessToken(tenant, order.id);
        const dispatch = await bippaMessagingClient.dispatchTemplateWithUrlButton(apiKey, {
            sourceReference: tenant.id,
            sellerReference: row.external_reference,
            to: toWaId(recipient.whatsappPhone),
            // Ação manual (clique explícito na UI): cada clique deve enviar
            // de novo, nunca ser deduplicado contra um envio anterior do
            // mesmo pedido -- por isso um sufixo aleatório, ao contrário do
            // disparo automático acima.
            idempotencyKey: `bippa-catalogo:${tenant.id}:seller:${recipient.sellerId}:order:${order.id}:manual:${randomUUID()}`,
            templateName: definition.name,
            languageCode: definition.languageCode,
            bodyParams: [recipient.clientName, String(order.orderNumber), formatBRL(order.total)],
            buttonParam: pathOnly(
                orderAccessLink(
                    tenant,
                    access.token,
                ),
            ),
        });
        if (dispatch.duplicate) await discardOrderAccessToken(tenant, access.token);
        else await revokePreviousOrderAccessTokens(tenant, order.id, access.token);
        return dispatch;
    }, {
        scope: "manual-order-whatsapp",
        kind: "order_template",
        orderId: order.id,
    });
    return result;
}

// Envio nativo (payment_order / PIX) -- diferente de
// sendPaymentLinkWhatsAppNow, não passa por um template do catálogo: monta
// direto o order_details pagável DENTRO do WhatsApp (ver
// bippaMessagingClient.ts::dispatchPaymentOrder). Toda a validação de
// pré-requisitos (CPF da cliente, chave Pix configurada) já aconteceu no
// chamador (orderWhatsAppService.ts) -- esta função só envia. `body` é
// obrigatório nesta rota (fora da variante de template, não usada aqui) --
// confirmado em produção: sem ele o Messaging recusa com
// `invalid_order_payload` / "body e obrigatorio...".
export async function sendPaymentOrderWhatsAppNow(
    tenant: Tenant,
    recipient: WhatsAppOrderRecipient,
    order: { id: string },
    referenceId: string,
    items: Array<{ retailerId: string; name: string; unitAmount: number; quantity: number }>,
    totalAmount: number,
    taxAmount: number,
    pix: { code: string; merchantName: string; key: string; keyType: string },
    shipping?: { amount: number; description?: string },
    discount?: { amount: number; description?: string },
): Promise<{ id: string }> {
    const result = await sendRequired(tenant, recipient, (row, apiKey) =>
        bippaMessagingClient.dispatchPaymentOrder(apiKey, {
            sourceReference: tenant.id,
            sellerReference: row.external_reference,
            to: toWaId(recipient.whatsappPhone),
            idempotencyKey: `bippa-catalogo:${tenant.id}:seller:${recipient.sellerId}:order:${order.id}:payment-order:manual:${randomUUID()}`,
            referenceId,
            body: `Olá, ${recipient.clientName}! Revise os detalhes do seu pedido e finalize o pagamento com Pix diretamente por aqui.`,
            footer: "Pagamento seguro",
            items,
            totalAmount,
            taxAmount,
            shippingAmount: shipping?.amount,
            shippingDescription: shipping?.description,
            discountAmount: discount?.amount,
            discountDescription: discount?.description,
            pix,
        }), {
        scope: "manual-payment-order-whatsapp",
        kind: "order_details",
        orderId: order.id,
    });
    return result;
}

export async function sendPaymentLinkWhatsAppNow(
    tenant: Tenant,
    recipient: WhatsAppOrderRecipient,
    link: string,
    orderId: string,
): Promise<{ id: string }> {
    const definition = standardWhatsAppTemplate(WHATSAPP_TEMPLATE_KEYS.paymentLink);
    const result = await sendRequired(tenant, recipient, (row, apiKey) =>
        bippaMessagingClient.dispatchTemplateWithUrlButton(apiKey, {
            sourceReference: tenant.id,
            sellerReference: row.external_reference,
            to: toWaId(recipient.whatsappPhone),
            idempotencyKey: `bippa-catalogo:${tenant.id}:seller:${recipient.sellerId}:payment-link:manual:${randomUUID()}`,
            templateName: definition.name,
            languageCode: definition.languageCode,
            bodyParams: [recipient.clientName],
            buttonParam: pathOnly(link),
        }), {
        scope: "manual-payment-link-whatsapp",
        kind: "payment_link_template",
        orderId,
    });
    return result;
}
