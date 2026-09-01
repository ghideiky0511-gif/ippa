import type Stripe from "stripe";
import type { ExternalApiCallReporter } from "@/lib/externalApiCall";
import type {
    CardChargeResult,
    ChargeResult,
    CreateChargeInput,
    PaymentChargeStatus,
    PaymentProvider,
    PaymentProviderCredentials,
    WebhookEvent,
} from "../../types";
import { getApplicationFeeBps, getStripeClient } from "./client";

// Direct charges (Connect, contas Express): diferente de todo outro
// provider deste registry, `credentials` aqui NÃO vem de
// credentials_encrypted decifrado -- não existe segredo por tenant (a
// STRIPE_SECRET_KEY é única, da plataforma, ver client.ts). Quem chama
// createStripePaymentProvider (paymentChargeService.ts,
// paymentReconciliationService.ts) monta `credentials` como
// `{ stripeAccountId }` a partir de tenant_payment_integrations.stripe_account_id
// -- ver providerCatalog.ts (onboardingType: "redirect") pra por que este
// provider nunca passa pelo formulário genérico de credenciais.
//
// parseWebhook existe pra satisfazer o contrato PaymentProvider, mas o
// roteamento real de webhook do Stripe Connect não passa por aqui: o
// evento chega sem tenant conhecido (só `event.account`), então quem
// decide "qual tenant, qual integration_id" é stripeWebhookService.ts,
// ANTES de qualquer instância de provider existir. Este parseWebhook só é
// útil depois que o tenant já foi resolvido.

function toStripeCredentials(credentials: PaymentProviderCredentials): { stripeAccountId: string } {
    const stripeAccountId = String(credentials.stripeAccountId ?? "").trim();
    if (!stripeAccountId) {
        throw new Error("createStripePaymentProvider requer credentials.stripeAccountId.");
    }
    return { stripeAccountId };
}

async function report<T>(
    reporter: ExternalApiCallReporter | undefined,
    operation: string,
    method: string,
    endpoint: string,
    run: () => Promise<T>,
): Promise<T> {
    const startedAt = Date.now();
    try {
        const result = await run();
        await reporter?.({
            operation,
            method,
            endpoint,
            statusCode: 200,
            success: true,
            durationMs: Date.now() - startedAt,
        });
        return result;
    } catch (exc) {
        const stripeError = exc as Stripe.errors.StripeError;
        await reporter?.({
            operation,
            method,
            endpoint,
            statusCode: stripeError?.statusCode ?? null,
            success: false,
            durationMs: Date.now() - startedAt,
            errorMessage: stripeError?.message,
            errorClass: stripeError?.type,
        });
        throw exc;
    }
}

function applicationFeeAmount(amountCents: number): number {
    return Math.round((amountCents * getApplicationFeeBps()) / 10_000);
}

function mapPaymentIntentStatus(status: Stripe.PaymentIntent.Status): PaymentChargeStatus {
    switch (status) {
        case "succeeded":
            return "paid";
        case "processing":
            return "processing";
        case "requires_payment_method":
        case "requires_action":
        case "requires_confirmation":
        case "requires_capture":
            return "pending";
        case "canceled":
            return "cancelled";
        default:
            return "failed";
    }
}

function toCardChargeResult(intent: Stripe.PaymentIntent): CardChargeResult {
    const charge = intent.latest_charge as Stripe.Charge | null | undefined;
    const paymentMethod = charge?.payment_method_details?.card;
    const succeeded = intent.status === "succeeded" || intent.status === "processing";
    return {
        method: "cartao",
        externalId: intent.id,
        status: succeeded ? "authorized" : "failed",
        lastDigits: paymentMethod?.last4 ?? undefined,
        brand: paymentMethod?.brand ?? undefined,
        failureReason: succeeded ? undefined : (charge?.failure_message ?? intent.last_payment_error?.message),
        raw: intent as unknown as Record<string, unknown>,
    };
}

// Extraído de parseWebhook pra ser reaproveitado por stripeWebhookService.ts,
// que já verificou a assinatura ele mesmo (precisa fazer isso ANTES de saber
// qual tenant/credenciais usar, então não passa pela instância do provider
// -- ver comentário no topo do arquivo). null = tipo de evento que não
// mapeamos (ex. account.updated, tratado à parte no webhook service).
export function mapStripePaymentIntentEvent(event: Stripe.Event): WebhookEvent | null {
    if (event.type !== "payment_intent.succeeded" && event.type !== "payment_intent.payment_failed") {
        return null;
    }
    const intent = event.data.object as Stripe.PaymentIntent;
    return {
        externalId: intent.id,
        externalEventId: event.id,
        type: event.type,
        status: mapPaymentIntentStatus(intent.status),
        // O PaymentIntent, não o Event que o envelopa -- mesmo shape que
        // fetchChargeStatus devolve, pra quem consome WebhookEvent.raw (ver
        // paymentChargeService.ts::extractInternalChargeId) não precisar
        // saber se veio de webhook ou de reconciliação.
        raw: intent as unknown as Record<string, unknown>,
    };
}

// Lógica pura de mapeamento account.updated -> nosso status de onboarding,
// extraída pra ser testável sem banco (ver stripeWebhookService.ts, que só
// orquestra: chama isto e grava o resultado).
export function mapStripeAccountOnboardingStatus(
    account: Pick<Stripe.Account, "charges_enabled" | "details_submitted" | "requirements">,
): "pending" | "complete" | "restricted" {
    if (account.requirements?.disabled_reason) return "restricted";
    if (account.charges_enabled && account.details_submitted) return "complete";
    return "pending";
}

export function createStripePaymentProvider(
    credentials: PaymentProviderCredentials,
    reporter?: ExternalApiCallReporter,
): PaymentProvider {
    const { stripeAccountId } = toStripeCredentials(credentials);

    return {
        code: "stripe",

        async createCharge(input: CreateChargeInput): Promise<ChargeResult> {
            if (input.method !== "cartao") {
                // Pix/boleto via Stripe Brasil ficam fora de escopo por ora --
                // o contrato já comporta a extensão (ChargeResult é union por
                // method), só não implementamos ainda. PixChargeResult/
                // BoletoChargeResult não têm um estado "falhou" (assumem
                // criação bem-sucedida), então não dá pra devolver um
                // ChargeResult aqui -- lançar é a única opção honesta.
                throw new Error(`Stripe: método "${input.method}" ainda não suportado.`);
            }
            if (!input.cardToken) {
                return {
                    method: "cartao",
                    externalId: "",
                    status: "failed",
                    failureReason: "Token de cartão ausente.",
                    raw: {},
                };
            }
            const client = getStripeClient();
            if (!client) throw new Error("Stripe não configurado (STRIPE_SECRET_KEY ausente).");

            const amountCents = Math.round(input.amount * 100);
            const intent = await report(reporter, "stripe.paymentIntents.create", "POST", "/v1/payment_intents", () =>
                client.paymentIntents.create(
                    {
                        amount: amountCents,
                        currency: "brl",
                        payment_method: input.cardToken,
                        confirm: true,
                        off_session: false,
                        application_fee_amount: applicationFeeAmount(amountCents),
                        metadata: {
                            order_id: input.orderId,
                            ...(input.internalChargeId ? { charge_id: input.internalChargeId } : {}),
                        },
                        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
                        // latest_charge nasce como só o id -- precisa expandir pra
                        // toCardChargeResult ler payment_method_details (bandeira/
                        // últimos dígitos) sem uma segunda chamada.
                        expand: ["latest_charge"],
                    },
                    {
                        stripeAccount: stripeAccountId,
                        idempotencyKey: input.internalChargeId,
                    },
                ),
            );
            return toCardChargeResult(intent);
        },

        async fetchChargeStatus(externalId: string): Promise<WebhookEvent> {
            const client = getStripeClient();
            if (!client) throw new Error("Stripe não configurado (STRIPE_SECRET_KEY ausente).");
            const intent = await report(
                reporter,
                "stripe.paymentIntents.retrieve",
                "GET",
                "/v1/payment_intents",
                () => client.paymentIntents.retrieve(externalId, { stripeAccount: stripeAccountId }),
            );
            return {
                externalId: intent.id,
                type: "payment_intent." + intent.status,
                status: mapPaymentIntentStatus(intent.status),
                raw: intent as unknown as Record<string, unknown>,
            };
        },

        parseWebhook(rawBody: string, headers: Record<string, string>, webhookSecret?: string): WebhookEvent | null {
            const client = getStripeClient();
            if (!client || !webhookSecret) return null;
            const signature = headers["stripe-signature"] ?? headers["Stripe-Signature"];
            if (!signature) return null;
            let event: Stripe.Event;
            try {
                event = client.webhooks.constructEvent(rawBody, signature, webhookSecret);
            } catch {
                return null;
            }
            return mapStripePaymentIntentEvent(event);
        },

        async testConnection() {
            const client = getStripeClient();
            if (!client) return { ok: false, message: "Stripe não configurado (STRIPE_SECRET_KEY ausente)." };
            try {
                const account = await report(reporter, "stripe.accounts.retrieve", "GET", "/v1/accounts", () =>
                    client.accounts.retrieve(stripeAccountId),
                );
                if (account.deleted) return { ok: false, message: "Connected account removida na Stripe." };
                return { ok: true };
            } catch (exc) {
                return {
                    ok: false,
                    message: exc instanceof Error ? exc.message : "Falha ao consultar a connected account.",
                };
            }
        },
    };
}
