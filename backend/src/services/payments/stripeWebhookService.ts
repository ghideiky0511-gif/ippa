import type { PoolClient } from "pg";
import type Stripe from "stripe";
import { withControlTransaction } from "@/lib/db/control";
import { findActiveTenantById, withTenantTransaction } from "@/lib/db/tenant";
import {
    getConnectWebhookSecretV1,
    getConnectWebhookSecretV2,
    getStripeClient,
} from "@/payments/providers/stripe/client";
import { mapStripeAccountOnboardingStatus, mapStripePaymentIntentEvent } from "@/payments/providers/stripe";
import {
    activatePaymentIntegrationRow,
    deactivatePaymentIntegrationProviderRow,
    upsertStripeAccountRow,
} from "@/models/paymentIntegrationsModel";
import {
    hasProcessedPaymentWebhookEvent,
    insertPaymentWebhookEventRow,
} from "@/models/paymentWebhookEventsModel";
import { applyPaymentChargeWebhookEvent } from "./paymentChargeService";
import { ValidationError } from "@/services/shared/errors";
import { errorMeta, logger } from "@/lib/logger";

const SYSTEM_ACTOR = { role: "system" };
const V2_ACCOUNT_EVENT_TYPES = new Set([
    "v2.core.account.closed",
    "v2.core.account[configuration.merchant].capability_status_updated",
    "v2.core.account[configuration.merchant].updated",
    "v2.core.account[requirements].updated",
]);
const PAYMENT_EVENT_TYPES = new Set([
    "payment_intent.succeeded",
    "payment_intent.payment_failed",
]);
const V2_ACCOUNT_INCLUDES = ["configuration.merchant", "requirements"] as const;

type StripeWebhookWork = {
    id: string;
    type: string;
    accountId: string;
    payload: Record<string, unknown>;
    apply: (client: PoolClient) => Promise<void>;
};

async function resolveTenantByStripeAccount(accountId: string): Promise<{ tenantId: string } | null> {
    return withControlTransaction(async (client) => {
        const result = await client.query<{ tenant_id: string }>(
            `SELECT tenant_id FROM tenant_payment_integrations
             WHERE provider = 'stripe' AND stripe_account_id = $1 AND stripe_api_version = 'v2'
             LIMIT 1`,
            [accountId],
        );
        return result.rows[0] ? { tenantId: result.rows[0].tenant_id } : null;
    });
}

async function logUnresolvedEvent(
    event: Pick<StripeWebhookWork, "id" | "type" | "payload">,
    processingError: string,
): Promise<void> {
    await withControlTransaction((client) =>
        client.query(
            `INSERT INTO payment_webhook_events (tenant_id, provider, external_event_id, event_type, signature_valid, payload, processing_error)
             VALUES (NULL, 'stripe', $1, $2, true, $3::jsonb, $4)`,
            [event.id, event.type, JSON.stringify(event.payload), processingError],
        ),
    );
}

async function applyV2AccountState(client: PoolClient, account: Stripe.V2.Core.Account): Promise<void> {
    const status = mapStripeAccountOnboardingStatus(account);
    const row = await upsertStripeAccountRow(client, {
        stripeAccountId: account.id,
        onboardingStatus: status,
        apiVersion: "v2",
    });
    if (status === "complete" && row && !row.active) {
        await activatePaymentIntegrationRow(client, "stripe");
    } else if (status !== "complete" && row?.active) {
        await deactivatePaymentIntegrationProviderRow(client, "stripe");
    }
}

async function processResolvedWebhook(work: StripeWebhookWork): Promise<void> {
    const resolved = await resolveTenantByStripeAccount(work.accountId);
    if (!resolved) {
        await logUnresolvedEvent(work, "unknown_stripe_account");
        return;
    }

    const tenant = await findActiveTenantById(resolved.tenantId);
    if (!tenant) {
        await logUnresolvedEvent(work, "tenant_inactive_or_not_found");
        return;
    }

    let processingError: string | undefined;
    try {
        await withTenantTransaction(tenant, SYSTEM_ACTOR, async (dbClient) => {
            if (await hasProcessedPaymentWebhookEvent(dbClient, "stripe", work.id)) return;
            await work.apply(dbClient);
            await insertPaymentWebhookEventRow(dbClient, {
                provider: "stripe",
                externalEventId: work.id,
                eventType: work.type,
                signatureValid: true,
                payload: work.payload,
                processedAt: new Date(),
            });
        });
    } catch (exc) {
        processingError = exc instanceof Error ? exc.message : String(exc);
        logger.error("stripe-webhook", "Falha ao processar evento Stripe", {
            tenantId: tenant.id,
            eventId: work.id,
            eventType: work.type,
            ...errorMeta(exc),
        });
    }

    if (processingError) {
        await withTenantTransaction(tenant, SYSTEM_ACTOR, (dbClient) =>
            insertPaymentWebhookEventRow(dbClient, {
                provider: "stripe",
                externalEventId: work.id,
                eventType: work.type,
                signatureValid: true,
                payload: work.payload,
                processingError,
            }),
        ).catch((loggingExc) => {
            logger.error("stripe-webhook", "Falha ao registrar erro de processamento", errorMeta(loggingExc));
        });
    }
}

async function processV2AccountWebhook(
    client: Stripe,
    rawBody: string,
    signature: string,
    webhookSecretV2: string,
): Promise<void> {
    const notification = client.parseEventNotification(rawBody, signature, webhookSecretV2);
    if (!V2_ACCOUNT_EVENT_TYPES.has(notification.type)) return;

    const accountId = (notification as { related_object?: { id?: string } | null }).related_object?.id;
    if (!accountId) {
        await logUnresolvedEvent({
            id: notification.id,
            type: notification.type,
            payload: notification as unknown as Record<string, unknown>,
        }, "no_account_in_event");
        return;
    }

    // Eventos v2 thin não trazem o snapshot da conta. A fonte de verdade é a
    // leitura atual pela API v2, como exigido pela Stripe para esse payload.
    const account = await client.v2.core.accounts.retrieve(accountId, {
        include: [...V2_ACCOUNT_INCLUDES],
    });
    await processResolvedWebhook({
        id: notification.id,
        type: notification.type,
        accountId,
        payload: notification as unknown as Record<string, unknown>,
        apply: (dbClient) => applyV2AccountState(dbClient, account),
    });
}

async function processPaymentWebhook(
    client: Stripe,
    rawBody: string,
    signature: string,
    webhookSecretV1: string,
): Promise<void> {
    const event = client.webhooks.constructEvent(rawBody, signature, webhookSecretV1);
    if (!PAYMENT_EVENT_TYPES.has(event.type)) return;
    const accountId = (event as { account?: string }).account;
    if (!accountId) {
        await logUnresolvedEvent({
            id: event.id,
            type: event.type,
            payload: event as unknown as Record<string, unknown>,
        }, "no_account_in_event");
        return;
    }
    const mapped = mapStripePaymentIntentEvent(event);
    if (!mapped) return;
    await processResolvedWebhook({
        id: event.id,
        type: event.type,
        accountId,
        payload: event as unknown as Record<string, unknown>,
        apply: async (dbClient) => {
            await applyPaymentChargeWebhookEvent(dbClient, "stripe", mapped);
        },
    });
}

export async function processStripeWebhook(
    rawBody: string,
    signature: string | null,
): Promise<{ status: number; body: { received: boolean } }> {
    const client = getStripeClient();
    if (!client) {
        throw new ValidationError("STRIPE_NOT_CONFIGURED", "Stripe não configurado.");
    }
    if (!signature) throw new ValidationError("INVALID_WEBHOOK_SIGNATURE", "Assinatura ausente.");

    let payload: { object?: string };
    try {
        payload = JSON.parse(rawBody) as { object?: string };
    } catch (exc) {
        logger.warn("stripe-webhook", "Webhook Stripe inválido ou não processável", errorMeta(exc));
        throw new ValidationError("INVALID_WEBHOOK_SIGNATURE", "Assinatura ou payload de webhook inválido.");
    }

    // O campo `object` do payload não-verificado só decide qual secret usar
    // na verificação de assinatura abaixo -- cada tipo de evento (thin v2 x
    // snapshot v1) vem de um Event Destination distinto na Stripe, com seu
    // próprio whsec_ (ver client.ts). Nenhum dado do payload é processado
    // antes da assinatura ser validada.
    const isV2Event = payload.object === "v2.core.event";
    const webhookSecret = isV2Event ? getConnectWebhookSecretV2() : getConnectWebhookSecretV1();
    if (!webhookSecret) {
        throw new ValidationError("STRIPE_NOT_CONFIGURED", "Stripe não configurado.");
    }

    try {
        if (isV2Event) {
            client.parseEventNotification(rawBody, signature, webhookSecret);
        } else {
            client.webhooks.constructEvent(rawBody, signature, webhookSecret);
        }
    } catch (exc) {
        logger.warn("stripe-webhook", "Webhook Stripe inválido ou não processável", errorMeta(exc));
        throw new ValidationError("INVALID_WEBHOOK_SIGNATURE", "Assinatura ou payload de webhook inválido.");
    }

    try {
        if (isV2Event) {
            await processV2AccountWebhook(client, rawBody, signature, webhookSecret);
        } else {
            await processPaymentWebhook(client, rawBody, signature, webhookSecret);
        }
    } catch (exc) {
        // A assinatura já foi verificada. Falhas transitórias de consulta ou
        // banco ficam observáveis no log, mas não expõem o endpoint a retries
        // infinitos de um evento que não pode ser aplicado naquele momento.
        logger.error("stripe-webhook", "Falha ao processar webhook Stripe", errorMeta(exc));
    }

    return { status: 200, body: { received: true } };
}
