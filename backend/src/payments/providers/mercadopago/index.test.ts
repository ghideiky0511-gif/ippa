import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { createMercadoPagoPaymentProvider, verifyMercadoPagoWebhookSignature } from "./index";

function mockFetchOnce(handler: (url: string, init?: RequestInit) => Response) {
    const previous = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, init });
        return handler(url, init);
    }) as typeof fetch;
    return {
        calls,
        restore: () => {
            globalThis.fetch = previous;
        },
    };
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

test("mercadopago: createCharge de pix mapeia qr_code/copy_paste/expiração", async () => {
    const mock = mockFetchOnce((url, init) => {
        assert.ok(url.startsWith("https://api.mercadopago.com/v1/orders"));
        assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer APP_USR-fake");
        const body = JSON.parse(String(init?.body));
        assert.equal(body.type, "online");
        assert.equal(body.transactions.payments[0].payment_method.id, "pix");
        assert.equal(body.transactions.payments[0].payment_method.type, "bank_transfer");
        return jsonResponse({
            id: "ORD01FAKE1",
            status: "created",
            transactions: {
                payments: [
                    {
                        status: "action_required",
                        status_detail: "waiting_payment",
                        expiration_time: "PT30M",
                        payment_method: { qr_code: "00020126copiaecola", qr_code_base64: "aGVsbG8=" },
                    },
                ],
            },
        });
    });
    try {
        const provider = createMercadoPagoPaymentProvider({ accessToken: "APP_USR-fake" });
        const charge = await provider.createCharge({
            amount: 100,
            method: "pix",
            orderId: "order-1",
            customer: { name: "Cliente Teste", document: "00000000000", email: "cliente@teste.com" },
        });
        assert.equal(charge.method, "pix");
        if (charge.method === "pix") {
            assert.equal(charge.externalId, "ORD01FAKE1");
            assert.equal(charge.copyPaste, "00020126copiaecola");
            assert.equal(charge.qrCode, "data:image/png;base64,aGVsbG8=");
            assert.ok(charge.expiresAt instanceof Date);
        }
    } finally {
        mock.restore();
    }
});

test("mercadopago: createCharge de cartão aprovado mapeia status authorized", async () => {
    const mock = mockFetchOnce(() =>
        jsonResponse({
            id: "ORD01FAKE2",
            status: "processed",
            transactions: {
                payments: [
                    {
                        status: "processed",
                        payment_method: { installments: 1, authorization_code: "AUTH123" },
                    },
                ],
            },
        }),
    );
    try {
        const provider = createMercadoPagoPaymentProvider({ accessToken: "APP_USR-fake" });
        const charge = await provider.createCharge({
            amount: 100,
            method: "cartao",
            orderId: "order-1",
            customer: { name: "Cliente Teste", document: "00000000000", email: "cliente@teste.com" },
            cardToken: "card_tok_123",
            paymentMethodId: "visa",
        });
        assert.equal(charge.method, "cartao");
        if (charge.method === "cartao") {
            assert.equal(charge.status, "authorized");
            assert.equal(charge.externalId, "ORD01FAKE2");
        }
    } finally {
        mock.restore();
    }
});

test("mercadopago: createCharge de cartão rejeitado mapeia status failed com motivo", async () => {
    const mock = mockFetchOnce(() =>
        jsonResponse({
            id: "ORD01FAKE3",
            status: "failed",
            transactions: {
                payments: [{ status: "failed", status_detail: "rejected_by_issuer" }],
            },
        }),
    );
    try {
        const provider = createMercadoPagoPaymentProvider({ accessToken: "APP_USR-fake" });
        const charge = await provider.createCharge({
            amount: 100,
            method: "cartao",
            orderId: "order-1",
            customer: { name: "Cliente Teste", document: "00000000000", email: "cliente@teste.com" },
            cardToken: "card_tok_123",
            paymentMethodId: "visa",
        });
        assert.equal(charge.method, "cartao");
        if (charge.method === "cartao") {
            assert.equal(charge.status, "failed");
            assert.equal(charge.failureReason, "rejected_by_issuer");
        }
    } finally {
        mock.restore();
    }
});

test("mercadopago: createCharge de cartão sem token falha sem chamar a API", async () => {
    const mock = mockFetchOnce(() => {
        throw new Error("não deveria chamar fetch");
    });
    try {
        const provider = createMercadoPagoPaymentProvider({ accessToken: "APP_USR-fake" });
        const charge = await provider.createCharge({
            amount: 100,
            method: "cartao",
            orderId: "order-1",
            customer: { name: "Cliente Teste", document: "00000000000", email: "cliente@teste.com" },
        });
        assert.equal(charge.method, "cartao");
        if (charge.method === "cartao") assert.equal(charge.status, "failed");
        assert.equal(mock.calls.length, 0);
    } finally {
        mock.restore();
    }
});

test("mercadopago: createCharge de boleto lança (fora de escopo)", async () => {
    const provider = createMercadoPagoPaymentProvider({ accessToken: "APP_USR-fake" });
    await assert.rejects(
        () =>
            provider.createCharge({
                amount: 100,
                method: "boleto",
                orderId: "order-1",
                customer: { name: "Cliente Teste", document: "00000000000", email: "cliente@teste.com" },
            }),
        /ainda não suportado/,
    );
});

test("mercadopago: fetchChargeStatus mapeia processed para paid", async () => {
    const mock = mockFetchOnce((url, init) => {
        assert.ok(url.endsWith("/v1/orders/ORD01FAKE1"));
        assert.equal(init?.method, "GET");
        return jsonResponse({
            id: "ORD01FAKE1",
            status: "processed",
            transactions: { payments: [{ status: "processed" }] },
        });
    });
    try {
        const provider = createMercadoPagoPaymentProvider({ accessToken: "APP_USR-fake" });
        const event = await provider.fetchChargeStatus("ORD01FAKE1");
        assert.equal(event.status, "paid");
        assert.equal(event.externalId, "ORD01FAKE1");
    } finally {
        mock.restore();
    }
});

test("mercadopago: cancelCharge chama POST /cancel", async () => {
    const mock = mockFetchOnce((url, init) => {
        assert.ok(url.endsWith("/v1/orders/ORD01FAKE1/cancel"));
        assert.equal(init?.method, "POST");
        return jsonResponse({ id: "ORD01FAKE1", status: "canceled" });
    });
    try {
        const provider = createMercadoPagoPaymentProvider({ accessToken: "APP_USR-fake" });
        await provider.cancelCharge?.("ORD01FAKE1");
    } finally {
        mock.restore();
    }
});

test("verifyMercadoPagoWebhookSignature: aceita assinatura válida e rejeita adulterada", () => {
    const secret = "webhook-secret";
    const dataId = "ORD01FAKE1";
    const requestId = "req-1";
    const ts = "1700000000000";
    const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
    const v1 = createHmac("sha256", secret).update(manifest).digest("hex");
    const headers = { "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": requestId };

    assert.equal(verifyMercadoPagoWebhookSignature(dataId, headers, secret), true);
    assert.equal(verifyMercadoPagoWebhookSignature("ORD0OTHER", headers, secret), false);
    assert.equal(verifyMercadoPagoWebhookSignature(dataId, headers, "wrong-secret"), false);
    assert.equal(verifyMercadoPagoWebhookSignature(dataId, {}, secret), false);
});
