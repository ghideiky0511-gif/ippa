import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser } from "@/lib/types";
import { errorMeta, logger } from "@/lib/logger";
import { findClientRow, type ClientRow } from "@/models/clientsModel";
import { findOrderFreightRowByOrderId } from "@/models/orderFreightsModel";
import {
    findOrderRowById,
    listOrderItemRowsByOrder,
} from "@/models/ordersModel";
import {
    insertOrderWhatsAppAttemptRow,
    listOrderWhatsAppAttemptRowsByOrderId,
    type OrderWhatsAppAttemptOutcome,
    type OrderWhatsAppAttemptRow,
} from "@/models/orderWhatsAppAttemptsModel";
import { findActivePaymentIntegrationRow } from "@/models/paymentIntegrationsModel";
import { findWhatsAppConnectionBySeller } from "@/models/whatsappConnectionsModel";
import { orderPaymentLink } from "@/services/notifications";
import {
    createOrderCharge,
    isPaymentIntegrationReadyToCharge,
} from "@/services/payments/paymentChargeService";
import {
    ForbiddenError,
    NotFoundError,
    ValidationError,
} from "@/services/shared/errors";
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

export type SendOrderWhatsAppKind = z.infer<
    typeof SendOrderWhatsAppInputSchema
>["kind"];

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
    // pré-requisitos próprios (documento da cliente, chave Pix configurada)
    // que não bloqueiam as outras duas variantes (order/payment_link).
    paymentOrderAvailable: boolean;
    paymentOrderReason?: string;
}

function isAdministrator(user: AuthUser): boolean {
    return (
        user.role === "administrador" && user.permissions?.adminAccess === true
    );
}

// Checagem compartilhada entre validateWhatsAppAvailability (GET, prévia
// pra UI) e sendOrderWhatsApp (POST, defesa contra mudança de estado entre
// as duas chamadas -- mesmo raciocínio já usado aqui pra
// assertWhatsAppConnectionAvailable). Não checa mais `capability_payments`:
// o bippa-messaging não usa mais esse campo pra bloquear
// payment-orders/payment-requests (virou só registro de auditoria de quem
// confirmou a aprovação da Meta, ver PATCH .../payments-capability), então
// bloquear aqui no lado do produto ficaria redundante e sem efeito real.
async function assessPaymentOrderAvailability(
    client: PoolClient,
    registration: ClientRow,
): Promise<{ available: boolean; reason?: string }> {
    if (!registration.cpf_cnpj?.trim() || !registration.email?.trim()) {
        return {
            available: false,
            reason: "Cadastre o CPF/CNPJ e o e-mail da cliente antes de enviar.",
        };
    }
    const integration = await findActivePaymentIntegrationRow(client);
    if (!integration || !isPaymentIntegrationReadyToCharge(integration)) {
        return {
            available: false,
            reason: "Nenhum gateway de pagamento pronto para cobrar (onboarding incompleto).",
        };
    }
    const pixMerchantName = integration.credentials_meta?.pixMerchantName as
        | string
        | undefined;
    const pixKey = integration.credentials_meta?.pixKey as string | undefined;
    const pixKeyType = integration.credentials_meta?.pixKeyType as
        | string
        | undefined;
    if (!pixMerchantName || !pixKey || !pixKeyType) {
        return {
            available: false,
            reason: "Configure a chave Pix da loja em Integrações > Pagamentos.",
        };
    }
    return { available: true };
}

// Registro best-effort do histórico (order_whatsapp_send_attempts, migration
// 071) -- nunca deixa uma falha ao GRAVAR o histórico mascarar o resultado
// real do envio (sucesso vira erro pra quem clicou, ou o erro original de
// falha no envio é substituído por um erro de log): loga e segue.
async function recordOrderWhatsAppAttempt(
    tenant: Tenant,
    actor: AuthUser,
    value: {
        orderId: string;
        kind: SendOrderWhatsAppKind;
        outcome: OrderWhatsAppAttemptOutcome;
        toMasked: string;
        messageId: string | null;
        error: string | null;
    },
): Promise<void> {
    try {
        await withTenantTransaction(tenant, actor, (client) =>
            insertOrderWhatsAppAttemptRow(client, {
                orderId: value.orderId,
                kind: value.kind,
                outcome: value.outcome,
                actorId: actor.id,
                actorRole: actor.role,
                actorName: actor.name,
                toMasked: value.toMasked,
                messageId: value.messageId,
                error: value.error,
            }),
        );
    } catch (err) {
        logger.warn(
            "order-whatsapp",
            "Falha ao registrar tentativa de envio no histórico",
            errorMeta(err),
        );
    }
}

// Histórico de tentativas de envio deste pedido pelo WhatsApp, mais recente
// primeiro -- usado pela página de detalhe do pedido (quem mandou o quê,
// quando, e deu certo). Mesma forma de orderPushService.listOrderPushHistory.
export async function listOrderWhatsAppHistory(
    tenant: Tenant,
    actor: AuthUser,
    orderId: string,
): Promise<OrderWhatsAppAttemptRow[]> {
    return withTenantTransaction(tenant, actor, (client) =>
        listOrderWhatsAppAttemptRowsByOrderId(client, orderId),
    );
}

export async function validateWhatsAppAvailability(
    tenant: Tenant,
    orderId: string,
): Promise<WhatsAppAvailabilityStatus> {
    try {
        return await withTenantTransaction(tenant, {}, async (client) => {
            const order = await findOrderRowById(client, orderId);
            if (!order)
                return {
                    available: false,
                    reason: "Pedido não encontrado.",
                    paymentOrderAvailable: false,
                };
            if (order.status === "cancelado")
                return {
                    available: false,
                    reason: "Pedido cancelado.",
                    paymentOrderAvailable: false,
                };
            if (!order.client_id)
                return {
                    available: false,
                    reason: "Vincule uma cliente ao pedido antes de enviar.",
                    paymentOrderAvailable: false,
                };
            if (!order.seller_id)
                return {
                    available: false,
                    reason: "Este pedido ainda não tem uma vendedora responsável.",
                    paymentOrderAvailable: false,
                };

            const registration = await findClientRow(client, order.client_id);
            if (!registration)
                return {
                    available: false,
                    reason: "Cliente não encontrado.",
                    paymentOrderAvailable: false,
                };
            if (!registration.whatsapp_phone)
                return {
                    available: false,
                    reason: "Cadastre o telefone WhatsApp da cliente.",
                    paymentOrderAvailable: false,
                };

            const connection = await findWhatsAppConnectionBySeller(
                client,
                order.seller_id,
            );
            if (!hasActiveWhatsAppConnection(connection)) {
                return {
                    available: false,
                    reason: "A vendedora ainda não tem um WhatsApp conectado.",
                    paymentOrderAvailable: false,
                    paymentOrderReason:
                        "A vendedora ainda não tem um WhatsApp conectado.",
                };
            }

            const paymentOrder = await assessPaymentOrderAvailability(
                client,
                registration,
            );
            return {
                available: true,
                paymentOrderAvailable: paymentOrder.available,
                paymentOrderReason: paymentOrder.reason,
            };
        });
    } catch {
        return {
            available: false,
            reason: "Erro ao validar disponibilidade.",
            paymentOrderAvailable: false,
        };
    }
}

export async function sendOrderWhatsApp(
    tenant: Tenant,
    actor: AuthUser,
    orderId: string,
    rawInput: unknown,
): Promise<SendOrderWhatsAppResult> {
    const parsed = SendOrderWhatsAppInputSchema.safeParse(rawInput);
    if (!parsed.success)
        throw new ValidationError(
            "INVALID_INPUT",
            "Ação de WhatsApp inválida.",
            parsed.error.issues,
        );

    const prepared = await withTenantTransaction(
        tenant,
        actor,
        async (client) => {
            const order = await findOrderRowById(client, orderId);
            if (!order) throw new NotFoundError("ORDER_NOT_FOUND");
            const ownsOrder =
                actor.role === "vendedora" && order.seller_id === actor.id;
            if (!isAdministrator(actor) && !ownsOrder)
                throw new ForbiddenError();
            if (order.status === "cancelado")
                throw new ValidationError("ORDER_ALREADY_CANCELLED");
            if (!order.client_id) {
                throw new ValidationError(
                    "WHATSAPP_CLIENT_REQUIRED",
                    "Vincule uma cliente ao pedido antes de enviá-lo pelo WhatsApp.",
                );
            }
            if (!order.seller_id) {
                throw new ValidationError(
                    "WHATSAPP_SELLER_REQUIRED",
                    "Este pedido ainda não tem uma vendedora responsável.",
                );
            }
            const registration = await findClientRow(client, order.client_id);
            if (!registration) throw new NotFoundError("CLIENT_NOT_FOUND");
            if (!registration.whatsapp_phone) {
                throw new ValidationError(
                    "WHATSAPP_PHONE_REQUIRED",
                    "Cadastre o telefone WhatsApp da cliente antes de enviar.",
                );
            }

            let pix:
                | {
                      code: string;
                      merchantName: string;
                      key: string;
                      keyType: string;
                  }
                | undefined;
            let items:
                | Array<{
                      retailerId: string;
                      name: string;
                      unitAmount: number;
                      quantity: number;
                  }>
                | undefined;
            let shipping: { amount: number; description?: string } | undefined;
            let discount: { amount: number; description?: string } | undefined;
            if (parsed.data.kind === "payment_order") {
                const paymentOrderStatus = await assessPaymentOrderAvailability(
                    client,
                    registration,
                );
                if (!paymentOrderStatus.available) {
                    throw new ValidationError(
                        "PAYMENT_ORDER_NOT_AVAILABLE",
                        paymentOrderStatus.reason ??
                            "Envio nativo de pagamento indisponível.",
                    );
                }
                const integration =
                    await findActivePaymentIntegrationRow(client);
                // Já validado em assessPaymentOrderAvailability acima -- os
                // `!` seguintes são seguros porque paymentOrderStatus.available
                // só é true quando os 4 campos existem.
                pix = {
                    merchantName: integration!.credentials_meta
                        .pixMerchantName as string,
                    key: integration!.credentials_meta.pixKey as string,
                    keyType: integration!.credentials_meta.pixKeyType as string,
                    code: "",
                };
                const itemRows = await listOrderItemRowsByOrder(
                    client,
                    orderId,
                );
                items = itemRows.map((row) => ({
                    retailerId: row.snapshot.id,
                    name: row.snapshot.name,
                    unitAmount: Math.round(row.snapshot.price * 100),
                    quantity: row.snapshot.qty,
                }));
                // items[].unit_amount de 0 é rejeitado pelo Messaging
                // (allowZero: false, ver api-reference.md) -- diferente de
                // tax_amount/shipping_amount, que aceitam 0. Um item promocional
                // ou brinde a custo zero passa em qualquer outro fluxo de pedido,
                // mas não pode ir no payment_order nativo.
                if (items.some((item) => item.unitAmount <= 0)) {
                    throw new ValidationError(
                        "PAYMENT_ORDER_ZERO_PRICE_ITEM",
                        "Este pedido tem um item com valor zero, que o pagamento nativo do WhatsApp não aceita. Use o link de pagamento.",
                    );
                }
                // O Messaging exige total_amount = soma(items) + tax_amount +
                // shipping_amount - discount_amount (ver api-reference.md);
                // order.total já embute frete e desconto (orderService.ts), então
                // sem repassar os dois aqui a conta do provider nunca fecha e o
                // envio cai com 400 invalid_order_payload.
                const freightRow = await findOrderFreightRowByOrderId(
                    client,
                    orderId,
                );
                if (freightRow && Number(freightRow.price) > 0) {
                    shipping = {
                        amount: Math.round(Number(freightRow.price) * 100),
                        description: freightRow.label,
                    };
                }
                if (order.discount && order.discount.amount > 0) {
                    discount = {
                        amount: Math.round(order.discount.amount * 100),
                        description: order.discount.label,
                    };
                }
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
                shipping,
                discount,
            };
        },
    );

    // Check before generating/rotating a payment token. Sending checks again
    // so a state change between preparation and the external call is safe.
    await assertWhatsAppConnectionAvailable(
        tenant,
        prepared.recipient.sellerId,
    );

    const toMasked = maskWhatsAppPhone(prepared.recipient.whatsappPhone);
    let delivery: { id: string };
    try {
        if (parsed.data.kind === "payment_link") {
            const { token } = await createOrderPaymentLink(
                tenant,
                actor,
                orderId,
            );
            delivery = await sendPaymentLinkWhatsAppNow(
                tenant,
                prepared.recipient,
                orderPaymentLink(tenant, token),
                prepared.order.id,
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
                customer: {
                    name: prepared.recipient.clientName,
                    document: prepared.document,
                    email: prepared.email,
                },
            });
            if (charge.method !== "pix") {
                throw new ValidationError(
                    "PAYMENT_CHARGE_FAILED",
                    "Não foi possível gerar o código Pix.",
                );
            }
            // reference_id "identifica o pedido, não a mensagem" e fica preso
            // para sempre ao primeiro idempotency_key usado com ele (ver
            // api-reference.md) -- só é possível reenviar o cartão de
            // pagamento (idempotency_key novo a cada clique, ver
            // sendPaymentOrderWhatsAppNow) gerando também um reference_id novo
            // por tentativa; do contrário o Messaging recusa com 409
            // reference_conflict a partir do segundo envio bem-sucedido do
            // mesmo pedido. O prefixo com orderId é só pra rastreio manual.
            delivery = await sendPaymentOrderWhatsAppNow(
                tenant,
                prepared.recipient,
                prepared.order,
                `${prepared.order.id}.${randomUUID().slice(0, 8)}`,
                prepared.items ?? [],
                Math.round(prepared.order.total * 100),
                0,
                { ...prepared.pix!, code: charge.copyPaste },
                prepared.shipping,
                prepared.discount,
            );
        } else {
            delivery = await sendOrderConfirmedWhatsAppNow(
                tenant,
                prepared.recipient,
                prepared.order,
            );
        }
    } catch (err) {
        await recordOrderWhatsAppAttempt(tenant, actor, {
            orderId,
            kind: parsed.data.kind,
            outcome: "failed",
            toMasked,
            messageId: null,
            error: err instanceof Error ? err.message : "Erro desconhecido.",
        });
        throw err;
    }

    await recordOrderWhatsAppAttempt(tenant, actor, {
        orderId,
        kind: parsed.data.kind,
        outcome: "sent",
        toMasked,
        messageId: delivery.id,
        error: null,
    });

    return {
        messageId: delivery.id,
        kind: parsed.data.kind,
        toMasked,
    };
}
