import assert from "node:assert/strict";
import test from "node:test";
import {
    createStripePaymentProvider,
    extractStripeCardTransactionDetails,
    extractStripeFailureMessage,
    mapStripeAccountOnboardingStatus,
} from "./index";

// STRIPE_SECRET_KEY precisa existir ANTES do primeiro getStripeClient() --
// o singleton em client.ts é lazy (só lê a env var quando chamado), então
// basta setar antes do primeiro teste rodar, não antes do import.
process.env.STRIPE_SECRET_KEY = "sk_test_fake";

// Stripe.createFetchHttpClient() (ver client.ts) captura globalThis.fetch no
// momento em que o client (singleton, lazy) é construído -- na primeira
// chamada de qualquer teste. Reatribuir globalThis.fetch depois disso não
// muda o que o SDK já capturou. Por isso instalamos UM wrapper estável, uma
// vez só, e cada teste só troca o handler pro qual ele delega.
let currentHandler: ((url: string, init?: RequestInit) => Response) | undefined;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    if (!currentHandler) throw new Error("Nenhum handler de fetch mockado para este teste.");
    return currentHandler(String(input), init);
}) as typeof fetch;

function mockFetchOnce(handler: (url: string, init?: RequestInit) => Response) {
    const previous = currentHandler;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    currentHandler = (url, init) => {
        calls.push({ url, init });
        return handler(url, init);
    };
    return {
        calls,
        restore: () => {
            currentHandler = previous;
        },
    };
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

test("stripe: createCharge autorizada mapeia PaymentIntent succeeded", async () => {
    const mock = mockFetchOnce((url) => {
        assert.ok(url.startsWith("https://api.stripe.com/v1/payment_intents"));
        return jsonResponse({
            id: "pi_123",
            object: "payment_intent",
            status: "succeeded",
            latest_charge: {
                id: "ch_123",
                payment_method_details: { card: { last4: "4242", brand: "visa" } },
            },
        });
    });
    try {
        const provider = createStripePaymentProvider({ stripeAccountId: "acct_123" });
        const charge = await provider.createCharge({
            amount: 100,
            method: "cartao",
            orderId: "order-1",
            customer: { name: "Cliente Teste", document: "00000000000", email: "cliente@teste.com" },
            cardToken: "pm_card_visa",
            internalChargeId: "11111111-1111-1111-1111-111111111111",
        });
        assert.equal(charge.method, "cartao");
        if (charge.method === "cartao") {
            assert.equal(charge.status, "authorized");
            assert.equal(charge.externalId, "pi_123");
            assert.equal(charge.lastDigits, "4242");
            assert.equal(charge.brand, "visa");
        }
    } finally {
        mock.restore();
    }
});

test("stripe: createCharge sem cardToken falha sem chamar a API", async () => {
    const mock = mockFetchOnce(() => {
        throw new Error("não deveria chamar a Stripe sem cardToken");
    });
    try {
        const provider = createStripePaymentProvider({ stripeAccountId: "acct_123" });
        const charge = await provider.createCharge({
            amount: 100,
            method: "cartao",
            orderId: "order-1",
            customer: { name: "Cliente Teste", document: "00000000000", email: "cliente@teste.com" },
        });
        assert.equal(charge.method, "cartao");
        if (charge.method === "cartao") assert.equal(charge.status, "failed");
    } finally {
        mock.restore();
    }
});

test("stripe: fetchChargeStatus mapeia status pendente e falho", async () => {
    const mock = mockFetchOnce(() =>
        jsonResponse({ id: "pi_456", object: "payment_intent", status: "requires_payment_method" }),
    );
    try {
        const provider = createStripePaymentProvider({ stripeAccountId: "acct_123" });
        const event = await provider.fetchChargeStatus("pi_456");
        assert.equal(event.externalId, "pi_456");
        assert.equal(event.status, "pending");
    } finally {
        mock.restore();
    }
});

test("stripe: testConnection ok quando a connected account existe", async () => {
    const mock = mockFetchOnce((url) => {
        assert.ok(url.startsWith("https://api.stripe.com/v2/core/accounts/acct_123"));
        return jsonResponse({ id: "acct_123", object: "v2.core.account", applied_configurations: ["merchant"], created: "2026-09-01T00:00:00.000Z", livemode: false, closed: false });
    });
    try {
        const provider = createStripePaymentProvider({ stripeAccountId: "acct_123" });
        const result = await provider.testConnection?.();
        assert.equal(result?.ok, true);
    } finally {
        mock.restore();
    }
});

test("stripe: testConnection falha sem lançar quando a conta não existe", async () => {
    const mock = mockFetchOnce(() =>
        jsonResponse(
            { error: { type: "invalid_request_error", message: "No such account: 'acct_123'" } },
            404,
        ),
    );
    try {
        const provider = createStripePaymentProvider({ stripeAccountId: "acct_123" });
        const result = await provider.testConnection?.();
        assert.equal(result?.ok, false);
        assert.ok(result?.message);
    } finally {
        mock.restore();
    }
});

test("createStripePaymentProvider exige stripeAccountId", () => {
    assert.throws(() => createStripePaymentProvider({}), /stripeAccountId/);
});

test("mapStripeAccountOnboardingStatus: pending enquanto cartão está pendente", () => {
    assert.equal(
        mapStripeAccountOnboardingStatus({
            configuration: { merchant: { applied: true, capabilities: { card_payments: { status: "pending", status_details: [] } } } },
        }),
        "pending",
    );
});

test("mapStripeAccountOnboardingStatus: complete quando card_payments está ativa", () => {
    assert.equal(
        mapStripeAccountOnboardingStatus({
            configuration: { merchant: { applied: true, capabilities: { card_payments: { status: "active", status_details: [] } } } },
        }),
        "complete",
    );
});

test("mapStripeAccountOnboardingStatus: restricted quando cartão exige ação", () => {
    assert.equal(
        mapStripeAccountOnboardingStatus({
            configuration: {
                merchant: {
                    applied: true,
                    capabilities: {
                        card_payments: {
                            status: "restricted",
                            status_details: [{ code: "requirements_past_due", resolution: "provide_info" }],
                        },
                    },
                },
            },
        }),
        "restricted",
    );
});

test("extractStripeCardTransactionDetails: lê network_transaction_id, authorization_code e installments do PaymentIntent bruto", () => {
    assert.deepEqual(
        extractStripeCardTransactionDetails({
            latest_charge: {
                payment_method_details: {
                    card: {
                        network_transaction_id: "116728512090991",
                        authorization_code: "221539",
                        installments: { plan: { count: 3 } },
                    },
                },
            },
        }),
        { nsu: "116728512090991", installments: 3 },
    );
});

test("extractStripeCardTransactionDetails: cai pra authorization_code quando network_transaction_id está ausente", () => {
    assert.deepEqual(
        extractStripeCardTransactionDetails({
            latest_charge: { payment_method_details: { card: { authorization_code: "221539" } } },
        }),
        { nsu: "221539", installments: 1 },
    );
});

test("extractStripeCardTransactionDetails: sem latest_charge expandido devolve installments=1 e sem nsu", () => {
    assert.deepEqual(extractStripeCardTransactionDetails({ latest_charge: "ch_123" }), { nsu: undefined, installments: 1 });
    assert.deepEqual(extractStripeCardTransactionDetails({}), { nsu: undefined, installments: 1 });
});

test("extractStripeFailureMessage: prioriza raw.error (caminho de erro inesperado do provider)", () => {
    assert.equal(
        extractStripeFailureMessage({ error: "No such PaymentMethod", latest_charge: { failure_message: "outro motivo" } }),
        "No such PaymentMethod",
    );
});

test("extractStripeFailureMessage: cai pro failure_message do charge, depois pro last_payment_error", () => {
    assert.equal(
        extractStripeFailureMessage({ latest_charge: { failure_message: "Cartão recusado" } }),
        "Cartão recusado",
    );
    assert.equal(
        extractStripeFailureMessage({ last_payment_error: { message: "Fundos insuficientes" } }),
        "Fundos insuficientes",
    );
    assert.equal(extractStripeFailureMessage({}), undefined);
});
