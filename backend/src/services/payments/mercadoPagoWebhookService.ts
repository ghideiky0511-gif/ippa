import { withControlTransaction } from "@/lib/db/control";
import type { ActorContext } from "@/lib/db/tenant";
import { findActiveTenantById, withTenantTransaction } from "@/lib/db/tenant";
import { getMercadoPagoWebhookSecret } from "@/payments/providers/mercadopago/client";
import { verifyMercadoPagoWebhookSignature } from "@/payments/providers/mercadopago";
import { createPaymentProvider } from "@/payments/registry";
import { findPaymentIntegrationRowByProvider, type PaymentIntegrationRow } from "@/models/paymentIntegrationsModel";
import { hasProcessedPaymentWebhookEvent, insertPaymentWebhookEventRow } from "@/models/paymentWebhookEventsModel";
import { applyPaymentChargeWebhookEvent } from "./paymentChargeService";
import { resolveProviderCredentials } from "./providerCredentials";
import { createExternalApiCallReporter } from "@/services/erp/externalApiLogService";
import { ValidationError } from "@/services/shared/errors";
import { errorMeta, logger } from "@/lib/logger";

// Webhook Mercado Pago -- mesmo espírito de stripeWebhookService.ts, mas a
// resolução de tenant é diferente: o payload do Stripe carrega
// `event.account` inline; o do Mercado Pago só traz
// `{ id, type: "order", data: { id: orderId } }` (sem status, sem
// identificador de conta). Por isso: (1) o tenant é resolvido via
// payment_charges (provider='mercadopago', external_id=orderId) -- funciona
// porque essa linha já é gravada com o order_id ANTES do createCharge
// retornar (ver paymentChargeService.ts::createOrderCharge, e
// providers/mercadopago/index.ts, migrado da API de Pagamentos pra API de
// Orders -- externalId agora é sempre order_id); (2) depois de resolver o
// tenant, ainda é preciso um GET /v1/orders/{id} pra saber o status real (o
// corpo do webhook não traz).
//
// Dois ids diferentes no mesmo payload, dois papéis diferentes: `data.id`
// (o order_id) entra no manifest de assinatura e na busca por tenant/
// status; `id` (o id da NOTIFICAÇÃO em si, distinto por entrega) é a chave
// de idempotência -- usar order_id pra idempotência apagaria eventos de
// verdade (duas notificações "action_required" depois "processed" pro
// MESMO order_id seriam tratadas como duplicatas uma da outra).

const SYSTEM_ACTOR: ActorContext = { role: "system" };

async function resolveTenantByMercadoPagoOrderId(orderId: string): Promise<{ tenantId: string } | null> {
    return withControlTransaction(async (client) => {
        const result = await client.query<{ tenant_id: string }>(
            `SELECT tenant_id FROM payment_charges WHERE provider = 'mercadopago' AND external_id = $1 LIMIT 1`,
            [orderId],
        );
        return result.rows[0] ? { tenantId: result.rows[0].tenant_id } : null;
    });
}

async function logUnresolvedEvent(
    notificationId: string | undefined,
    payload: Record<string, unknown>,
    processingError: string,
): Promise<void> {
    await withControlTransaction((client) =>
        client.query(
            `INSERT INTO payment_webhook_events (tenant_id, provider, external_event_id, event_type, signature_valid, payload, processing_error)
             VALUES (NULL, 'mercadopago', $1, 'payment', true, $2::jsonb, $3)`,
            [notificationId ?? null, JSON.stringify(payload), processingError],
        ),
    );
}

interface MercadoPagoWebhookPayload {
    id?: number | string;
    type?: string;
    action?: string;
    data?: { id?: string };
}

export async function processMercadoPagoWebhook(
    rawBody: string,
    headers: Record<string, string>,
): Promise<{ status: number; body: { received: boolean } }> {
    const webhookSecret = getMercadoPagoWebhookSecret();
    if (!webhookSecret) throw new ValidationError("MERCADOPAGO_NOT_CONFIGURED", "Mercado Pago não configurado.");

    let payload: MercadoPagoWebhookPayload;
    try {
        payload = JSON.parse(rawBody) as MercadoPagoWebhookPayload;
    } catch (exc) {
        logger.warn("mercadopago-webhook", "Webhook Mercado Pago com corpo inválido", errorMeta(exc));
        throw new ValidationError("INVALID_WEBHOOK_SIGNATURE", "Corpo de webhook inválido.");
    }

    const orderId = payload.data?.id;
    const notificationId = payload.id !== undefined ? String(payload.id) : undefined;
    if (!orderId) {
        // Tipo de evento sem data.id (ex. teste de conectividade do painel)
        // -- nada pra verificar/processar, mesmo espírito de "evento
        // irrelevante" nas outras rotas de webhook.
        return { status: 200, body: { received: true } };
    }

    // Assinatura verificada ANTES de qualquer campo do payload virar
    // consulta ao banco -- mesma ordem de processStripeWebhook.
    if (!verifyMercadoPagoWebhookSignature(orderId, headers, webhookSecret)) {
        logger.warn("mercadopago-webhook", "Assinatura de webhook Mercado Pago inválida", { orderId });
        throw new ValidationError("INVALID_WEBHOOK_SIGNATURE", "Assinatura de webhook inválida.");
    }

    try {
        await processResolvedWebhook(orderId, notificationId, payload as unknown as Record<string, unknown>);
    } catch (exc) {
        // Assinatura já verificada -- falha aqui é transitória (banco,
        // API do Mercado Pago fora do ar), não expõe o endpoint a retries
        // infinitos de um evento que não pode ser aplicado agora (mesmo
        // raciocínio de processStripeWebhook).
        logger.error("mercadopago-webhook", "Falha ao processar webhook Mercado Pago", {
            orderId,
            ...errorMeta(exc),
        });
    }

    return { status: 200, body: { received: true } };
}

async function processResolvedWebhook(
    orderId: string,
    notificationId: string | undefined,
    payload: Record<string, unknown>,
): Promise<void> {
    const resolved = await resolveTenantByMercadoPagoOrderId(orderId);
    if (!resolved) {
        await logUnresolvedEvent(notificationId, payload, "unknown_order_id");
        return;
    }
    const tenant = await findActiveTenantById(resolved.tenantId);
    if (!tenant) {
        await logUnresolvedEvent(notificationId, payload, "tenant_inactive_or_not_found");
        return;
    }

    const prepared = await withTenantTransaction(tenant, SYSTEM_ACTOR, async (client) => {
        if (notificationId && (await hasProcessedPaymentWebhookEvent(client, "mercadopago", notificationId))) {
            return { alreadyProcessed: true as const, integrationRow: null };
        }
        const integrationRow: PaymentIntegrationRow | null = await findPaymentIntegrationRowByProvider(client, "mercadopago");
        return { alreadyProcessed: false as const, integrationRow };
    });
    // Idempotência real (notificação já aplicada): silencioso, não é um
    // erro nem um evento "não identificável". Só chega em logUnresolvedEvent
    // se a integração não existir mais -- caso raro (desconectada entre a
    // cobrança e o webhook chegar), aí sim vale registrar.
    if (prepared.alreadyProcessed) return;
    if (!prepared.integrationRow) {
        await logUnresolvedEvent(notificationId, payload, "integration_not_found");
        return;
    }
    const integrationRow = prepared.integrationRow;

    // Corpo do webhook é magro (sem status) -- busca o order completo,
    // mesmo papel de fetchChargeStatus na reconciliação. Fora de qualquer
    // transação de propósito (nunca segurar conexão do pool durante uma
    // chamada de rede).
    const credentials = await resolveProviderCredentials(tenant, SYSTEM_ACTOR, integrationRow);
    const provider = createPaymentProvider(
        "mercadopago",
        credentials,
        createExternalApiCallReporter(tenant, SYSTEM_ACTOR, "mercadopago"),
    );
    const event = await provider.fetchChargeStatus(orderId);

    let processingError: string | undefined;
    try {
        await withTenantTransaction(tenant, SYSTEM_ACTOR, async (dbClient) => {
            await applyPaymentChargeWebhookEvent(dbClient, "mercadopago", event);
            await insertPaymentWebhookEventRow(dbClient, {
                provider: "mercadopago",
                externalEventId: notificationId,
                eventType: event.type,
                signatureValid: true,
                payload,
                processedAt: new Date(),
            });
        });
    } catch (exc) {
        processingError = exc instanceof Error ? exc.message : String(exc);
        logger.error("mercadopago-webhook", "Falha ao aplicar evento Mercado Pago", {
            tenantId: tenant.id,
            orderId,
            ...errorMeta(exc),
        });
    }

    if (processingError) {
        await withTenantTransaction(tenant, SYSTEM_ACTOR, (dbClient) =>
            insertPaymentWebhookEventRow(dbClient, {
                provider: "mercadopago",
                externalEventId: notificationId,
                eventType: event.type,
                signatureValid: true,
                payload,
                processingError,
            }),
        ).catch((loggingExc) => {
            logger.error("mercadopago-webhook", "Falha ao registrar erro de processamento", errorMeta(loggingExc));
        });
    }
}
