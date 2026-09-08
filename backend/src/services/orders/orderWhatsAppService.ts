import { z } from "zod";
import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser } from "@/lib/types";
import { findClientRow } from "@/models/clientsModel";
import { findOrderRowById } from "@/models/ordersModel";
import { orderPaymentLink } from "@/services/notifications";
import { ForbiddenError, NotFoundError, ValidationError } from "@/services/shared/errors";
import {
    assertWhatsAppConnectionAvailable,
    sendOrderConfirmedWhatsAppNow,
    sendPaymentLinkWhatsAppNow,
    type WhatsAppOrderRecipient,
} from "@/services/whatsapp";
import { createOrderPaymentLink } from "./orderPaymentLinkService";

export const SendOrderWhatsAppInputSchema = z.object({
    kind: z.enum(["order", "payment_link"]),
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

function isAdministrator(user: AuthUser): boolean {
    return user.role === "administrador" && user.permissions?.adminAccess === true;
}

export async function sendOrderWhatsApp(
    tenant: Tenant,
    actor: AuthUser,
    orderId: string,
    rawInput: unknown,
): Promise<SendOrderWhatsAppResult> {
    const parsed = SendOrderWhatsAppInputSchema.safeParse(rawInput);
    if (!parsed.success) throw new ValidationError("INVALID_INPUT", "A\u00e7\u00e3o de WhatsApp inv\u00e1lida.", parsed.error.issues);

    const prepared = await withTenantTransaction(tenant, actor, async (client) => {
        const order = await findOrderRowById(client, orderId);
        if (!order) throw new NotFoundError("ORDER_NOT_FOUND");
        const ownsOrder = actor.role === "vendedora" && order.seller_id === actor.id;
        if (!isAdministrator(actor) && !ownsOrder) throw new ForbiddenError();
        if (order.status === "cancelado") throw new ValidationError("ORDER_ALREADY_CANCELLED");
        if (!order.client_id) {
            throw new ValidationError("WHATSAPP_CLIENT_REQUIRED", "Vincule uma cliente ao pedido antes de envi\u00e1-lo pelo WhatsApp.");
        }
        if (!order.seller_id) {
            throw new ValidationError("WHATSAPP_SELLER_REQUIRED", "Este pedido ainda n\u00e3o tem uma vendedora respons\u00e1vel.");
        }
        const registration = await findClientRow(client, order.client_id);
        if (!registration) throw new NotFoundError("CLIENT_NOT_FOUND");
        if (!registration.whatsapp_phone) {
            throw new ValidationError("WHATSAPP_PHONE_REQUIRED", "Cadastre o telefone WhatsApp da cliente antes de enviar.");
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
    } else {
        delivery = await sendOrderConfirmedWhatsAppNow(tenant, prepared.recipient, prepared.order);
    }

    return {
        messageId: delivery.id,
        kind: parsed.data.kind,
        toMasked: maskWhatsAppPhone(prepared.recipient.whatsappPhone),
    };
}
