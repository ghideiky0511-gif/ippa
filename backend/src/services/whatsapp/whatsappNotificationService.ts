import type { ActorContext, Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import { formatBRL } from "@/lib/format";
import { errorMeta, logger } from "@/lib/logger";
import { findActiveWhatsAppIntegrationRowBySellerId, type SellerWhatsAppIntegrationRow } from "@/models/sellerWhatsappIntegrationsModel";
import type { ClientRow } from "@/models/clientsModel";
import { orderDetailsLink } from "@/services/notifications/emailNotificationService";
import { sendTemplateMessage } from "@/whatsapp/client";
import { toWaId } from "@/whatsapp/payloadBuilders";

// Terceiro canal de notificação de pedido, ao lado de e-mail e push in-app
// (emailNotificationService.ts) -- não é a fase de order_details/
// order_status pagáveis dentro do WhatsApp (ver plano de integração),
// só confirmação de pedido e link de pagamento via message template comum.
//
// Nunca lança: falha vira log e retorno silencioso, mesmo princípio do
// try/catch em notifyFirstAccessConfirmation -- e-mail/push já cobrem a
// notificação, WhatsApp aqui é estritamente aditivo.

// Quem recebe a notificação por WhatsApp é resolvido por `client.
// lastSellerId` (não pelo `user`/`recipient` do e-mail, que é o LOGIN da
// cliente, não a vendedora que a atende) -- ver decisão no plano de
// integração. Os call-sites (orderService, paymentService,
// paymentLinkService) já têm o ClientRow em mãos dentro da transação de
// checkout; constroem este objeto ali e passam pra cá depois de commitar.
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

async function resolveActiveIntegration(tenant: Tenant, sellerId: string): Promise<SellerWhatsAppIntegrationRow | null> {
    const actor: ActorContext = { userId: sellerId, role: "vendedora" };
    return withTenantTransaction(tenant, actor, (client) => findActiveWhatsAppIntegrationRowBySellerId(client, sellerId));
}

async function deliver(
    tenant: Tenant,
    recipient: WhatsAppOrderRecipient,
    logScope: string,
    send: (row: SellerWhatsAppIntegrationRow) => Promise<{ id: string }>,
): Promise<void> {
    try {
        const row = await resolveActiveIntegration(tenant, recipient.sellerId);
        if (!row || !row.phone_number_id || !row.access_token) return; // sem vendedora conectada -- e-mail/push já cobrem
        if (!row.credentials_meta.templatesApproved) {
            logger.info(logScope, "Templates ainda não aprovados pela Meta -- envio pulado", {
                tenantId: tenant.id,
                sellerId: recipient.sellerId,
            });
            return;
        }
        const result = await send(row);
        logger.info(logScope, "Mensagem de WhatsApp enviada", {
            tenantId: tenant.id,
            sellerId: recipient.sellerId,
            waMessageId: result.id,
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
    void deliver(tenant, recipient, "order-confirmed-whatsapp", async (row) => {
        const response = await sendTemplateMessage(row.phone_number_id!, row.access_token!, {
            to: toWaId(recipient.whatsappPhone),
            templateName: "order_confirmed",
            languageCode: "pt_BR",
            bodyParameters: [
                { type: "text", text: recipient.clientName },
                { type: "text", text: String(order.orderNumber) },
                { type: "text", text: formatBRL(order.total) },
                { type: "text", text: orderDetailsLink(tenant, order.orderNumber) },
            ],
        });
        return response.messages[0];
    });
}

export function sendPaymentLinkWhatsApp(
    tenant: Tenant,
    recipient: WhatsAppOrderRecipient | null,
    link: string,
): void {
    if (!recipient) return;
    void deliver(tenant, recipient, "payment-link-whatsapp", async (row) => {
        const response = await sendTemplateMessage(row.phone_number_id!, row.access_token!, {
            to: toWaId(recipient.whatsappPhone),
            templateName: "payment_link",
            languageCode: "pt_BR",
            bodyParameters: [
                { type: "text", text: recipient.clientName },
                { type: "text", text: link },
            ],
        });
        return response.messages[0];
    });
}
