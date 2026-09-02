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
        assert.ok(url.startsWith("https://api.mercadopago.com/v1/payments"));
        assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer APP_USR-fake");
        const body = JSON.parse(String(init?.body));
        assert.equal(body.payment_method_id, "pix");
        return jsonResponse({
            id: 123456,
            status: "pending",
            date_of_expiration: "2026-09-01T17:00:00.000-03:00",
            point_of_interaction: {
                transaction_data: { qr_code: "00020126copiaecola", qr_code_base64: "aGVsbG8=" },
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
            assert.equal(charge.externalId, "123456");
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
        jsonResponse({ id: 789, status: "approved", installments: 1, authorization_code: "AUTH123" }),
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
            assert.equal(charge.externalId, "789");
        }
    } finally {
        mock.restore();
    }
});

test("mercadopago: createCharge de cartão rejeitado mapeia status failed com motivo", async () => {
    const mock = mockFetchOnce(() =>
        jsonResponse({ id: 790, status: "rejected", status_detail: "cc_rejected_insufficient_amount" }),
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
            assert.equal(charge.failureReason, "cc_rejected_insufficient_amount");
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

test("mercadopago: fetchChargeStatus mapeia approved para paid", async () => {
    const mock = mockFetchOnce((url, init) => {
        assert.ok(url.endsWith("/v1/payments/123456"));
        assert.equal(init?.method, "GET");
        return jsonResponse({ id: 123456, status: "approved" });
    });
    try {
        const provider = createMercadoPagoPaymentProvider({ accessToken: "APP_USR-fake" });
        const event = await provider.fetchChargeStatus("123456");
        assert.equal(event.status, "paid");
        assert.equal(event.externalId, "123456");
    } finally {
        mock.restore();
    }
});

test("mercadopago: cancelCharge chama PUT com status cancelled", async () => {
    const mock = mockFetchOnce((url, init) => {
        assert.ok(url.endsWith("/v1/payments/123456"));
        assert.equal(init?.method, "PUT");
        assert.deepEqual(JSON.parse(String(init?.body)), { status: "cancelled" });
        return jsonResponse({ id: 123456, status: "cancelled" });
    });
    try {
        const provider = createMercadoPagoPaymentProvider({ accessToken: "APP_USR-fake" });
        await provider.cancelCharge?.("123456");
    } finally {
        mock.restore();
    }
});

test("verifyMercadoPagoWebhookSignature: aceita assinatura válida e rejeita adulterada", () => {
    const secret = "webhook-secret";
    const dataId = "123456";
    const requestId = "req-1";
    const ts = "1700000000000";
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const v1 = createHmac("sha256", secret).update(manifest).digest("hex");
    const headers = { "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": requestId };

    assert.equal(verifyMercadoPagoWebhookSignature(dataId, headers, secret), true);
    assert.equal(verifyMercadoPagoWebhookSignature("999999", headers, secret), false);
    assert.equal(verifyMercadoPagoWebhookSignature(dataId, headers, "wrong-secret"), false);
    assert.equal(verifyMercadoPagoWebhookSignature(dataId, {}, secret), false);
});
