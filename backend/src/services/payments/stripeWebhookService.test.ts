import assert from "node:assert/strict";
import test from "node:test";
import Stripe from "stripe";
import { processStripeWebhook } from "./stripeWebhookService";

// STRIPE_SECRET_KEY precisa existir ANTES do primeiro getStripeClient() --
// mesmo padrão de payments/providers/stripe/index.test.ts.
process.env.STRIPE_SECRET_KEY = "sk_test_fake";

let currentHandler: ((url: string, init?: RequestInit) => Response) | undefined;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    if (!currentHandler) throw new Error("Nenhum handler de fetch mockado para este teste.");
    return currentHandler(String(input), init);
}) as typeof fetch;

const signingClient = new Stripe("sk_test_fake_signing", { httpClient: Stripe.createFetchHttpClient() });

function signAsV1(payload: string, secret: string): string {
    return signingClient.webhooks.generateTestHeaderString({ payload, secret });
}

function signAsV2(payload: string, secret: string): string {
    // parseEventNotification usa o mesmo esquema de assinatura HMAC do v1
    // (ver stripe.core.js), então o mesmo gerador de header de teste serve
    // pros dois formatos -- só o payload/parser final muda.
    return signingClient.webhooks.generateTestHeaderString({ payload, secret });
}

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
    const previous: Record<string, string | undefined> = {};
    for (const key of Object.keys(vars)) {
        previous[key] = process.env[key];
        if (vars[key] === undefined) delete process.env[key];
        else process.env[key] = vars[key];
    }
    try {
        return fn();
    } finally {
        for (const key of Object.keys(previous)) {
            if (previous[key] === undefined) delete process.env[key];
            else process.env[key] = previous[key];
        }
    }
}

test("processStripeWebhook: evento v1 sem STRIPE_CONNECT_WEBHOOK_SECRET falha com STRIPE_NOT_CONFIGURED", async () => {
    await withEnv(
        { STRIPE_CONNECT_WEBHOOK_SECRET: undefined, STRIPE_CONNECT_WEBHOOK_SECRET_V2: "whsec_v2" },
        async () => {
            const rawBody = JSON.stringify({ object: "event", id: "evt_1", type: "payment_intent.created" });
            await assert.rejects(
                () => processStripeWebhook(rawBody, "t=1,v1=fake"),
                (exc: unknown) => exc instanceof Error && "code" in exc && (exc as { code: string }).code === "STRIPE_NOT_CONFIGURED",
            );
        },
    );
});

test("processStripeWebhook: evento v2 (thin) sem STRIPE_CONNECT_WEBHOOK_SECRET_V2 falha com STRIPE_NOT_CONFIGURED mesmo com secret v1 configurado", async () => {
    await withEnv(
        { STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_v1", STRIPE_CONNECT_WEBHOOK_SECRET_V2: undefined },
        async () => {
            const rawBody = JSON.stringify({ object: "v2.core.event", id: "evt_2", type: "v2.core.account.created" });
            await assert.rejects(
                () => processStripeWebhook(rawBody, "t=1,v1=fake"),
                (exc: unknown) => exc instanceof Error && "code" in exc && (exc as { code: string }).code === "STRIPE_NOT_CONFIGURED",
            );
        },
    );
});

test("processStripeWebhook: assinatura v1 gerada com o secret v2 é rejeitada (secrets não são intercambiáveis)", async () => {
    await withEnv(
        { STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_v1_real", STRIPE_CONNECT_WEBHOOK_SECRET_V2: "whsec_v2_real" },
        async () => {
            const rawBody = JSON.stringify({ object: "event", id: "evt_3", type: "payment_intent.created" });
            const wrongSignature = signAsV1(rawBody, "whsec_v2_real");
            await assert.rejects(
                () => processStripeWebhook(rawBody, wrongSignature),
                (exc: unknown) => exc instanceof Error && "code" in exc && (exc as { code: string }).code === "INVALID_WEBHOOK_SIGNATURE",
            );
        },
    );
});

test("processStripeWebhook: evento v1 fora do mapeamento (não succeeded/failed) passa a assinatura e retorna 200 sem tocar o banco", async () => {
    await withEnv(
        { STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_v1_real", STRIPE_CONNECT_WEBHOOK_SECRET_V2: "whsec_v2_real" },
        async () => {
            const rawBody = JSON.stringify({ object: "event", id: "evt_4", type: "payment_intent.created" });
            const signature = signAsV1(rawBody, "whsec_v1_real");
            const result = await processStripeWebhook(rawBody, signature);
            assert.deepEqual(result, { status: 200, body: { received: true } });
        },
    );
});

test("processStripeWebhook: evento v2 fora do mapeamento passa a assinatura e retorna 200 sem tocar o banco", async () => {
    await withEnv(
        { STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_v1_real", STRIPE_CONNECT_WEBHOOK_SECRET_V2: "whsec_v2_real" },
        async () => {
            const rawBody = JSON.stringify({ object: "v2.core.event", id: "evt_5", type: "v2.core.account.created" });
            const signature = signAsV2(rawBody, "whsec_v2_real");
            const result = await processStripeWebhook(rawBody, signature);
            assert.deepEqual(result, { status: 200, body: { received: true } });
        },
    );
});
