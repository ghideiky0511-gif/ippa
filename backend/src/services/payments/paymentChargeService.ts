import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { ActorContext, Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import { createPaymentProvider } from "@/payments/registry";
import type { CardChargeResult, WebhookEvent } from "@/payments/types";
import { findActivePaymentIntegrationRow } from "@/models/paymentIntegrationsModel";
import {
    applyPaymentChargeStatusByExternalId,
    applyPaymentChargeStatusById,
    insertPendingPaymentChargeRow,
    markPaymentChargeCreatedRow,
} from "@/models/paymentChargesModel";
import {
    findOrderRowById,
    listOrderItemSeparationRowsByOrder,
    updateOrderPaymentStatusRow,
    type OrderItemSeparationRow,
} from "@/models/ordersModel";
import { createExternalApiCallReporter } from "@/services/erp/externalApiLogService";
import { NotFoundError, ValidationError } from "@/services/shared/errors";
import { errorMeta, logger } from "@/lib/logger";

// Primeiro consumidor real de PaymentProvider (registry.ts) -- até aqui só
// o mock exercitava o contrato. createOrderCharge é o motor reutilizável de
// cobrança; qual tela de checkout chama ele é uma decisão em aberto (ver
// plano) -- este arquivo não assume nenhuma.

export async function createOrderCharge(
    tenant: Tenant,
    actor: ActorContext,
    orderId: string,
    input: {
        cardToken: string;
        customer: { name: string; document: string; email: string };
    },
): Promise<CardChargeResult> {
    const prepared = await withTenantTransaction(tenant, actor, async (client) => {
        const integrationRow = await findActivePaymentIntegrationRow(client);
        // Onboarding incompleto bloqueia a cobrança ANTES de qualquer chamada
        // à Stripe -- falha rápido, sem depender da própria Stripe rejeitar.
        if (
            !integrationRow ||
            integrationRow.provider !== "stripe" ||
            !integrationRow.stripe_account_id ||
            integrationRow.stripe_onboarding_status !== "complete"
        ) {
            throw new ValidationError(
                "PAYMENT_INTEGRATION_NOT_READY",
                "O gateway de pagamento deste tenant ainda não está pronto para cobrar (onboarding incompleto).",
            );
        }
        const order = await findOrderRowById(client, orderId);
        if (!order) throw new NotFoundError("ORDER_NOT_FOUND");

        const items = await listOrderItemSeparationRowsByOrder(client, orderId);
        assertOrderChargeable(items);

        // Grava a cobrança ANTES de chamar a Stripe (id gerado aqui) -- se o
        // webhook chegar antes desta função terminar, ele já encontra a
        // linha via metadata.charge_id (ver applyPaymentChargeWebhookEvent).
        const chargeRow = await insertPendingPaymentChargeRow(client, {
            id: randomUUID(),
            integrationId: integrationRow.id,
            provider: "stripe",
            orderId,
            method: "cartao",
            amount: Number(order.total),
        });
        return {
            chargeId: chargeRow.id,
            stripeAccountId: integrationRow.stripe_account_id,
            amount: Number(order.total),
        };
    });

    const provider = createPaymentProvider(
        "stripe",
        { stripeAccountId: prepared.stripeAccountId },
        createExternalApiCallReporter(tenant, actor, "stripe"),
    );

    let result: CardChargeResult;
    try {
        const charge = await provider.createCharge({
            amount: prepared.amount,
            method: "cartao",
            orderId,
            customer: input.customer,
            cardToken: input.cardToken,
            internalChargeId: prepared.chargeId,
        });
        // createCharge só devolve method "cartao" pro provider stripe --
        // ver providers/stripe/index.ts (pix/boleto lançam em vez de
        // devolver um ChargeResult "falhou").
        result = charge as CardChargeResult;
    } catch (exc) {
        logger.error("payment-charge", "Falha ao criar PaymentIntent na Stripe", {
            tenantId: tenant.id,
            orderId,
            chargeId: prepared.chargeId,
            ...errorMeta(exc),
        });
        // Nunca deixa o pedido em limbo mesmo numa falha de rede/API antes de
        // qualquer resposta -- é a mesma garantia que uma resposta "failed"
        // normal do provider recebe logo abaixo.
        await withTenantTransaction(tenant, actor, async (client) => {
            await markPaymentChargeCreatedRow(client, {
                id: prepared.chargeId,
                externalId: null,
                status: "failed",
                rawCreateResponse: { error: exc instanceof Error ? exc.message : String(exc) },
            });
            await updateOrderPaymentStatusRow(client, orderId, { paymentStatus: "payment_failed" });
        });
        // Nunca relança o erro cru da Stripe: ele não é um dos tipos que
        // apiHelpers.ts::serviceError reconhece, então a rota devolveria um
        // 500 sem corpo (o cliente via "Unexpected end of JSON input" em vez
        // de uma mensagem). Um erro de cartão (StripeCardError) é seguro de
        // mostrar; qualquer outro tipo (ex. resource_missing por um
        // PaymentMethod criado no contexto de conta errado) é um bug nosso,
        // não algo que o cliente causou.
        const stripeErrorType = (exc as { type?: string })?.type;
        return {
            method: "cartao",
            externalId: "",
            status: "failed",
            failureReason:
                stripeErrorType === "StripeCardError" && exc instanceof Error
                    ? exc.message
                    : "Não foi possível processar o pagamento. Tente novamente em instantes.",
            raw: {},
        };
    }

    await withTenantTransaction(tenant, actor, async (client) => {
        await markPaymentChargeCreatedRow(client, {
            id: prepared.chargeId,
            externalId: result.externalId || null,
            status: result.status === "authorized" ? "authorized" : "failed",
            cardLastDigits: result.lastDigits,
            cardBrand: result.brand,
            rawCreateResponse: result.raw,
        });
        // "authorized" ainda não é "paid" (mesma distinção do enum
        // payment_charge_status): o pagamento síncrono da Stripe some
        // definitivo em payment_intent.succeeded, que chega por webhook
        // (ou reconciliação) e é quem grava paid_at -- ver
        // applyPaymentChargeWebhookEvent abaixo. Falha síncrona, porém, é
        // definitiva aqui mesmo (requisito "sem limbo" no caminho síncrono).
        await updateOrderPaymentStatusRow(client, orderId, {
            paymentStatus: result.status === "authorized" ? "awaiting_confirmation" : "payment_failed",
        });
    });

    return result;
}

// Regra de negócio "sem separação, sem cobrança" (ver comentário de
// OrderStatusSchema em contracts/orders.ts: 'pago' só é alcançável a partir
// de 'separado'). Checa direto qty x qty_separated em vez de orders.status
// porque nada ainda escreve status='separado' (a transição fica para o
// serviço de fulfillment do Bippa) -- qty_separated é o fato físico real.
// Extraída pra ser testável sem banco, mesmo padrão de
// mapChargeStatusToOrderPaymentUpdate abaixo.
export function assertOrderChargeable(items: OrderItemSeparationRow[]): void {
    if (items.length === 0) {
        throw new ValidationError("ORDER_HAS_NO_ITEMS", "O pedido não tem itens e não pode ser cobrado.");
    }
    const pending = items.some((item) => item.qty_separated < item.qty);
    if (pending) {
        throw new ValidationError(
            "ORDER_ITEMS_NOT_SEPARATED",
            "Os itens do pedido ainda não foram confirmados como separados. Confirme a separação física antes de cobrar.",
        );
    }
}

export function extractInternalChargeId(raw: Record<string, unknown>): string | undefined {
    const metadata = raw.metadata as Record<string, unknown> | undefined;
    const value = metadata?.charge_id;
    return typeof value === "string" && value ? value : undefined;
}

// Lógica pura de tradução status de payment_charges -> transição de
// orders.payment_status, extraída pra ser testável sem banco. null = status
// que não move a trilha financeira do pedido (ex. "pending" antes de
// qualquer autorização).
export function mapChargeStatusToOrderPaymentUpdate(
    status: string,
): { paymentStatus: "paid" | "payment_failed" | "awaiting_confirmation"; advanceToNovo?: boolean } | null {
    if (status === "paid") return { paymentStatus: "paid", advanceToNovo: true };
    if (status === "failed" || status === "cancelled" || status === "expired") {
        return { paymentStatus: "payment_failed" };
    }
    if (status === "authorized" || status === "processing") return { paymentStatus: "awaiting_confirmation" };
    return null;
}

// Alimentado tanto por stripeWebhookService.ts (evento verificado, já
// dentro de uma transação de tenant) quanto por
// paymentReconciliationService.ts (resultado de fetchChargeStatus) -- os
// dois produzem o mesmo WebhookEvent normalizado (ver payments/types.ts),
// então convergem numa função só. Retorna null quando não há cobrança pra
// atualizar (estado já terminal -- idempotência via
// applyPaymentChargeStatus{ByExternalId,ById}'s WHERE status NOT IN (...) --
// ou cobrança de fato desconhecida).
export async function applyPaymentChargeWebhookEvent(
    client: PoolClient,
    provider: string,
    event: WebhookEvent,
): Promise<{ chargeId: string; orderId: string } | null> {
    let charge = await applyPaymentChargeStatusByExternalId(client, provider, event.externalId, {
        status: event.status,
        externalStatus: event.type,
        rawLastWebhook: event.raw,
    });
    if (!charge) {
        const internalChargeId = extractInternalChargeId(event.raw);
        if (internalChargeId) {
            charge = await applyPaymentChargeStatusById(client, internalChargeId, {
                status: event.status,
                externalStatus: event.type,
                rawLastWebhook: event.raw,
            });
        }
    }
    if (!charge) return null;

    const orderUpdate = mapChargeStatusToOrderPaymentUpdate(charge.status);
    if (orderUpdate) await updateOrderPaymentStatusRow(client, charge.order_id, orderUpdate);
    return { chargeId: charge.id, orderId: charge.order_id };
}
