import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import { formatBRL } from "@/lib/format";
import { errorMeta, logger } from "@/lib/logger";
import { getApiKey } from "@/messaging/bippaAuthClient";
import * as bippaMessagingClient from "@/messaging/bippaMessagingClient";
import { toWaId } from "@/messaging/payloadBuilders";
import { findWhatsAppConnectionBySeller, type WhatsAppConnectionRow } from "@/models/whatsappConnectionsModel";
import type { ClientRow } from "@/models/clientsModel";
import { orderDetailsLink } from "@/services/notifications/emailNotificationService";

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
// sem requisição autenticada em mãos). O registro/aprovação de
// template não é mais responsabilidade do Catálogo -- assume-se que os
// templates já estão aprovados centralmente no bippa-messaging/Meta.
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

async function deliver(
    tenant: Tenant,
    recipient: WhatsAppOrderRecipient,
    logScope: string,
    send: (row: WhatsAppConnectionRow, apiKey: string) => Promise<{ id: string }>,
): Promise<void> {
    try {
        const row = await resolveActiveIntegration(tenant, recipient.sellerId);
        if (!hasActiveWhatsAppConnection(row)) return; // vendedora sem WhatsApp conectado -- e-mail/push já cobrem
        const result = await send(row, getApiKey());
        logger.info(logScope, "Mensagem de WhatsApp enviada", {
            tenantId: tenant.id,
            sellerId: recipient.sellerId,
            messageId: result.id,
        });
    } catch (exc) {
        logger.error(logScope, "Falha ao enviar mensagem de WhatsApp", {
            tenantId: tenant.id,
            sellerId: recipient.sellerId,
            ...errorMeta(exc),
        });
    }
}

export function sendOrderConfirmedWhatsApp(
    tenant: Tenant,
    recipient: WhatsAppOrderRecipient | null,
    order: { id: string; orderNumber: number; total: number },
): void {
    if (!recipient) return;
    void deliver(tenant, recipient, "order-confirmed-whatsapp", async (row, apiKey) => {
        const result = await bippaMessagingClient.sendMessage(apiKey, {
            sourceReference: row.external_reference,
            senderProfile: row.sender_profile_key,
            to: toWaId(recipient.whatsappPhone),
            template: {
                name: "order_confirmed",
                languageCode: "pt_BR",
                bodyParameters: [
                    recipient.clientName,
                    String(order.orderNumber),
                    formatBRL(order.total),
                    orderDetailsLink(tenant, order.orderNumber),
                ],
            },
        });
        return result;
    });
}

export function sendPaymentLinkWhatsApp(
    tenant: Tenant,
    recipient: WhatsAppOrderRecipient | null,
    link: string,
): void {
    if (!recipient) return;
    void deliver(tenant, recipient, "payment-link-whatsapp", async (row, apiKey) => {
        const result = await bippaMessagingClient.sendMessage(apiKey, {
            sourceReference: row.external_reference,
            senderProfile: row.sender_profile_key,
            to: toWaId(recipient.whatsappPhone),
            template: {
                name: "payment_link",
                languageCode: "pt_BR",
                bodyParameters: [recipient.clientName, link],
            },
        });
        return result;
    });
}
