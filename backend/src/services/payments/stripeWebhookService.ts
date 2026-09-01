import type { PoolClient } from "pg";
import type Stripe from "stripe";
import { withControlTransaction } from "@/lib/db/control";
import { findActiveTenantById } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import { getConnectWebhookSecret, getStripeClient } from "@/payments/providers/stripe/client";
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

// Único endpoint Connect (recebe eventos de TODAS as connected accounts,
// `event.account` identifica qual) -- diferente de todo outro webhook deste
// registry, chega SEM tenant na URL nem no header, só no payload já
// verificado. Por isso o roteamento (achar tenant_id a partir de
// event.account) roda via withControlTransaction (bypassa RLS, mesmo
// padrão de catalogSyncService::dispatchCatalogSync) ANTES de abrir
// qualquer transação de tenant -- ver contexto no plano.

const SYSTEM_ACTOR = { role: "system" };

// Só a conta ASSINATURA -- account.updated conta se é onboarding completo,
// payment_intent.* alimenta payment_charges/orders via paymentChargeService.
const HANDLED_EVENT_TYPES = new Set([
    "account.updated",
    "payment_intent.succeeded",
    "payment_intent.payment_failed",
]);

async function resolveTenantByStripeAccount(
    accountId: string,
): Promise<{ tenantId: string } | null> {
    return withControlTransaction(async (client) => {
        const result = await client.query<{ tenant_id: string }>(
            `SELECT tenant_id FROM tenant_payment_integrations WHERE provider = 'stripe' AND stripe_account_id = $1 LIMIT 1`,
            [accountId],
        );
        return result.rows[0] ? { tenantId: result.rows[0].tenant_id } : null;
    });
}

// Caso "evento não identificável" (comentário original da migration 044,
// só de fato alcançável agora que existe um caminho de tenant_id NULL que
// não passa pela RLS de ippa_app).
async function logUnresolvedEvent(event: Stripe.Event, processingError: string): Promise<void> {
    await withControlTransaction((client) =>
        client.query(
            `INSERT INTO payment_webhook_events (tenant_id, provider, external_event_id, event_type, signature_valid, payload, processing_error)
             VALUES (NULL, 'stripe', $1, $2, true, $3::jsonb, $4)`,
            [event.id, event.type, JSON.stringify(event), processingError],
        ),
    );
}

async function applyAccountUpdated(client: PoolClient, account: Stripe.Account): Promise<void> {
    const status = mapStripeAccountOnboardingStatus(account);
    const row = await upsertStripeAccountRow(client, { stripeAccountId: account.id, onboardingStatus: status });
    if (status === "complete" && row && !row.active) {
        await activatePaymentIntegrationRow(client, "stripe");
    } else if (status !== "complete" && row?.active) {
        await deactivatePaymentIntegrationProviderRow(client, "stripe");
    }
}

export async function processStripeWebhook(
    rawBody: string,
    signature: string | null,
): Promise<{ status: number; body: { received: boolean } }> {
    const client = getStripeClient();
    const webhookSecret = getConnectWebhookSecret();
    if (!client || !webhookSecret) {
        throw new ValidationError("STRIPE_NOT_CONFIGURED", "Stripe não configurado.");
    }
    if (!signature) throw new ValidationError("INVALID_WEBHOOK_SIGNATURE", "Assinatura ausente.");

    let event: Stripe.Event;
    try {
        event = client.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (exc) {
        logger.warn("stripe-webhook", "Assinatura de webhook inválida", errorMeta(exc));
        throw new ValidationError("INVALID_WEBHOOK_SIGNATURE", "Assinatura inválida.");
    }

    if (!HANDLED_EVENT_TYPES.has(event.type)) {
        // Tipo que não assinamos/tratamos -- ack sem logar linha nenhuma
        // (não é um evento "não identificável", é só irrelevante).
        return { status: 200, body: { received: true } };
    }

    const account = (event as { account?: string }).account;
    if (!account) {
        await logUnresolvedEvent(event, "no_account_in_event");
        return { status: 200, body: { received: true } };
    }

    const resolved = await resolveTenantByStripeAccount(account);
    if (!resolved) {
        await logUnresolvedEvent(event, "unknown_stripe_account");
        return { status: 200, body: { received: true } };
    }

    const tenant = await findActiveTenantById(resolved.tenantId);
    if (!tenant) {
        await logUnresolvedEvent(event, "tenant_inactive_or_not_found");
        return { status: 200, body: { received: true } };
    }

    let processingError: string | undefined;
    try {
        await withTenantTransaction(tenant, SYSTEM_ACTOR, async (dbClient) => {
            // Idempotência real: só um evento já processado COM SUCESSO é
            // duplicata de verdade (ver hasProcessedPaymentWebhookEvent).
            if (event.id && (await hasProcessedPaymentWebhookEvent(dbClient, "stripe", event.id))) {
                return;
            }
            if (event.type === "account.updated") {
                await applyAccountUpdated(dbClient, event.data.object as Stripe.Account);
            } else {
                const mapped = mapStripePaymentIntentEvent(event);
                if (mapped) await applyPaymentChargeWebhookEvent(dbClient, "stripe", mapped);
            }
            await insertPaymentWebhookEventRow(dbClient, {
                provider: "stripe",
                externalEventId: event.id,
                eventType: event.type,
                signatureValid: true,
                payload: event as unknown as Record<string, unknown>,
                processedAt: new Date(),
            });
        });
    } catch (exc) {
        processingError = exc instanceof Error ? exc.message : String(exc);
        logger.error("stripe-webhook", "Falha ao processar evento Stripe", {
            tenantId: tenant.id,
            eventId: event.id,
            eventType: event.type,
            ...errorMeta(exc),
        });
    }

    if (processingError) {
        // Transação/conexão NOVA de propósito: se a falha acima veio de um
        // erro de banco, o client anterior fica numa transação abortada até
        // o ROLLBACK do withTenantTransaction que já rodou -- reusar aquele
        // client pra este INSERT arriscaria falhar em cascata e deixar o
        // evento sem log nenhum. Um erro AQUI (não deveria acontecer) só
        // vira log, nunca propaga -- devolver 200 pra Stripe já foi decidido.
        await withTenantTransaction(tenant, SYSTEM_ACTOR, (dbClient) =>
            insertPaymentWebhookEventRow(dbClient, {
                provider: "stripe",
                externalEventId: event.id,
                eventType: event.type,
                signatureValid: true,
                payload: event as unknown as Record<string, unknown>,
                processingError,
            }),
        ).catch((loggingExc) => {
            logger.error(
                "stripe-webhook",
                "Falha ao registrar o erro de processamento do webhook",
                errorMeta(loggingExc),
            );
        });
    }

    // 200 mesmo em erro de processamento -- Stripe re-entregar não resolve
    // um bug nosso, e o evento já está logado com processing_error (ver
    // hasProcessedPaymentWebhookEvent, que deixa passar de novo numa
    // redelivery real caso o bug seja corrigido).
    return { status: 200, body: { received: true } };
}
