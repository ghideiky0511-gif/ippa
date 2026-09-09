import { z } from "zod";
import type { PoolClient } from "pg";
import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser } from "@/lib/types";
import { findClientRow, type ClientRow } from "@/models/clientsModel";
import { findOrderRowById, listOrderItemRowsByOrder } from "@/models/ordersModel";
import { findActivePaymentIntegrationRow } from "@/models/paymentIntegrationsModel";
import { findWhatsAppConnectionBySeller, type WhatsAppConnectionRow } from "@/models/whatsappConnectionsModel";
import { orderPaymentLink } from "@/services/notifications";
import { createOrderCharge, isPaymentIntegrationReadyToCharge } from "@/services/payments/paymentChargeService";
import { ForbiddenError, NotFoundError, ValidationError } from "@/services/shared/errors";
import {
    assertWhatsAppConnectionAvailable,
    sendOrderConfirmedWhatsAppNow,
    sendPaymentLinkWhatsAppNow,
    sendPaymentOrderWhatsAppNow,
    hasActiveWhatsAppConnection,
    type WhatsAppOrderRecipient,
} from "@/services/whatsapp";
import { createOrderPaymentLink } from "./orderPaymentLinkService";

export const SendOrderWhatsAppInputSchema = z.object({
    kind: z.enum(["order", "payment_link", "payment_order"]),
});

export type SendOrderWhatsAppKind = z.infer<typeof SendOrderWhatsAppInputSchema>["kind"];

export interface SendOrderWhatsAppResult {
    messageId: string;
    kind: SendOrderWhatsAppKind;
    toMasked: string;
}

export function maskWhatsAppPhone(phone: string): string {
    const digits = phone.replace(/\D/g, "");
    if (digits.length <= 4) return "****";
    return `+${digits.slice(0, 2)} *****-${digits.slice(-4)}`;
}

export interface WhatsAppAvailabilityStatus {
    available: boolean;
    reason?: string;
    // Disponibilidade da variante nativa (payment_order/PIX, pagável DENTRO
    // do WhatsApp) -- distinta de `available` acima porque tem
    // pré-requisitos próprios (capability_payments da Meta, documento da
    // cliente, chave Pix configurada) que não bloqueiam as outras duas
    // variantes (order/payment_link).
    paymentOrderAvailable: boolean;
    paymentOrderReason?: string;
}

function isAdministrator(user: AuthUser): boolean {
    return user.role === "administrador" && user.permissions?.adminAccess === true;
}

// Checagem compartilhada entre validateWhatsAppAvailability (GET, prévia
// pra UI) e sendOrderWhatsApp (POST, defesa contra mudança de estado entre
// as duas chamadas -- mesmo raciocínio já usado aqui pra
// assertWhatsAppConnectionAvailable). `capability_payments` só existe na
// vendedora (whatsapp_connections), não no pedido -- por isso recebe a
// conexão já resolvida em vez de buscar de novo.
async function assessPaymentOrderAvailability(
    client: PoolClient,
    connection: WhatsAppConnectionRow | null,
    registration: ClientRow,
): Promise<{ available: boolean; reason?: string }> {
    if (!connection?.capability_payments) {
        return {
            available: false,
            reason: "Pagamento nativo no WhatsApp ainda não foi habilitado pela Meta para esta vendedora.",
        };
    }
    if (!registration.cpf_cnpj?.trim() || !registration.email?.trim()) {
        return { available: false, reason: "Cadastre o CPF/CNPJ e o e-mail da cliente antes de enviar." };
    }
    const integration = await findActivePaymentIntegrationRow(client);
    if (!integration || !isPaymentIntegrationReadyToCharge(integration)) {
        return { available: false, reason: "Nenhum gateway de pagamento pronto para cobrar (onboarding incompleto)." };
    }
    const pixMerchantName = integration.credentials_meta?.pixMerchantName as string | undefined;
    const pixKey = integration.credentials_meta?.pixKey as string | undefined;
    const pixKeyType = integration.credentials_meta?.pixKeyType as string | undefined;
    if (!pixMerchantName || !pixKey || !pixKeyType) {
        return { available: false, reason: "Configure a chave Pix da loja em Integrações > Pagamentos." };
    }
    return { available: true };
}

export async function validateWhatsAppAvailability(
    tenant: Tenant,
    orderId: string,
): Promise<WhatsAppAvailabilityStatus> {
    try {
        return await withTenantTransaction(tenant, {}, async (client) => {
            const order = await findOrderRowById(client, orderId);
            if (!order) return { available: false, reason: "Pedido não encontrado.", paymentOrderAvailable: false };
            if (order.status === "cancelado") return { available: false, reason: "Pedido cancelado.", paymentOrderAvailable: false };
            if (!order.client_id) return { available: false, reason: "Vincule uma cliente ao pedido antes de enviar.", paymentOrderAvailable: false };
            if (!order.seller_id) return { available: false, reason: "Este pedido ainda não tem uma vendedora responsável.", paymentOrderAvailable: false };

            const registration = await findClientRow(client, order.client_id);
            if (!registration) return { available: false, reason: "Cliente não encontrado.", paymentOrderAvailable: false };
            if (!registration.whatsapp_phone) return { available: false, reason: "Cadastre o telefone WhatsApp da cliente.", paymentOrderAvailable: false };

            const connection = await findWhatsAppConnectionBySeller(client, order.seller_id);
            if (!hasActiveWhatsAppConnection(connection)) {
                return {
                    available: false,
                    reason: "A vendedora ainda não tem um WhatsApp conectado.",
                    paymentOrderAvailable: false,
                    paymentOrderReason: "A vendedora ainda não tem um WhatsApp conectado.",
                };
            }

            const paymentOrder = await assessPaymentOrderAvailability(client, connection, registration);
            return { available: true, paymentOrderAvailable: paymentOrder.available, paymentOrderReason: paymentOrder.reason };
        });
    } catch {
        return { available: false, reason: "Erro ao validar disponibilidade.", paymentOrderAvailable: false };
    }
}

export async function sendOrderWhatsApp(
    tenant: Tenant,
    actor: AuthUser,
    orderId: string,
    rawInput: unknown,
): Promise<SendOrderWhatsAppResult> {
    const parsed = SendOrderWhatsAppInputSchema.safeParse(rawInput);
    if (!parsed.success) throw new ValidationError("INVALID_INPUT", "Ação de WhatsApp inválida.", parsed.error.issues);

    const prepared = await withTenantTransaction(tenant, actor, async (client) => {
        const order = await findOrderRowById(client, orderId);
        if (!order) throw new NotFoundError("ORDER_NOT_FOUND");
        const ownsOrder = actor.role === "vendedora" && order.seller_id === actor.id;
        if (!isAdministrator(actor) && !ownsOrder) throw new ForbiddenError();
        if (order.status === "cancelado") throw new ValidationError("ORDER_ALREADY_CANCELLED");
        if (!order.client_id) {
            throw new ValidationError("WHATSAPP_CLIENT_REQUIRED", "Vincule uma cliente ao pedido antes de enviá-lo pelo WhatsApp.");
        }
        if (!order.seller_id) {
            throw new ValidationError("WHATSAPP_SELLER_REQUIRED", "Este pedido ainda não tem uma vendedora responsável.");
        }
        const registration = await findClientRow(client, order.client_id);
        if (!registration) throw new NotFoundError("CLIENT_NOT_FOUND");
        if (!registration.whatsapp_phone) {
            throw new ValidationError("WHATSAPP_PHONE_REQUIRED", "Cadastre o telefone WhatsApp da cliente antes de enviar.");
        }

        let pix: { code: string; merchantName: string; key: string; keyType: string } | undefined;
        let items: Array<{ retailerId: string; name: string; unitAmount: number; quantity: number }> | undefined;
        if (parsed.data.kind === "payment_order") {
            const connection = await findWhatsAppConnectionBySeller(client, order.seller_id);
            const paymentOrderStatus = await assessPaymentOrderAvailability(client, connection, registration);
            if (!paymentOrderStatus.available) {
                throw new ValidationError("PAYMENT_ORDER_NOT_AVAILABLE", paymentOrderStatus.reason ?? "Envio nativo de pagamento indisponível.");
            }
            const integration = await findActivePaymentIntegrationRow(client);
            // Já validado em assessPaymentOrderAvailability acima -- os
            // `!` seguintes são seguros porque paymentOrderStatus.available
            // só é true quando os 4 campos existem.
            pix = {
                merchantName: integration!.credentials_meta.pixMerchantName as string,
                key: integration!.credentials_meta.pixKey as string,
                keyType: integration!.credentials_meta.pixKeyType as string,
                code: "",
            };
            const itemRows = await listOrderItemRowsByOrder(client, orderId);
            items = itemRows.map((row) => ({
                retailerId: row.snapshot.id,
                name: row.snapshot.name,
                unitAmount: Math.round(row.snapshot.price * 100),
                quantity: row.snapshot.qty,
            }));
        }

        const recipient: WhatsAppOrderRecipient = {
            whatsappPhone: registration.whatsapp_phone,
            sellerId: order.seller_id,
            clientName: registration.name,
        };
        return {
            recipient,
            order: {
                id: order.id,
                orderNumber: order.order_number,
                total: Number(order.total),
            },
            document: registration.cpf_cnpj ?? "",
            email: registration.email ?? "",
            pix,
            items,
        };
    });

    // Check before generating/rotating a payment token. Sending checks again
    // so a state change between preparation and the external call is safe.
    await assertWhatsAppConnectionAvailable(tenant, prepared.recipient.sellerId);

    let delivery: { id: string };
    if (parsed.data.kind === "payment_link") {
        const { token } = await createOrderPaymentLink(tenant, actor, orderId);
        delivery = await sendPaymentLinkWhatsAppNow(
            tenant,
            prepared.recipient,
            orderPaymentLink(tenant, token),
        );
    } else if (parsed.data.kind === "payment_order") {
        // A cobrança PIX real é criada aqui (fora da transação acima, mesmo
        // raciocínio de orderPaymentLinkService.ts -- createOrderCharge abre
        // suas próprias transações e chama o provider) só pra obter o
        // copia-e-cola gerado pelo PSP ativo; merchant_name/key/key_type
        // (não gerados por cobrança nenhuma) já vieram da configuração da
        // loja acima.
        const charge = await createOrderCharge(tenant, actor, orderId, {
            method: "pix",
            customer: { name: prepared.recipient.clientName, document: prepared.document, email: prepared.email },
        });
        if (charge.method !== "pix") {
            throw new ValidationError("PAYMENT_CHARGE_FAILED", "Não foi possível gerar o código Pix.");
        }
        delivery = await sendPaymentOrderWhatsAppNow(
            tenant,
            prepared.recipient,
            prepared.order,
            prepared.order.id,
            prepared.items ?? [],
            Math.round(prepared.order.total * 100),
            0,
            { ...prepared.pix!, code: charge.copyPaste },
        );
    } else {
        delivery = await sendOrderConfirmedWhatsAppNow(tenant, prepared.recipient, prepared.order);
    }

    return {
        messageId: delivery.id,
        kind: parsed.data.kind,
        toMasked: maskWhatsAppPhone(prepared.recipient.whatsappPhone),
    };
}
