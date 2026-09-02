import assert from "node:assert/strict";
import test from "node:test";
import { createPaymentProvider, listSupportedPaymentProviders } from "./registry";

test("registry conhece o provider mock", () => {
    assert.ok(listSupportedPaymentProviders().includes("mock"));
});

test("registry conhece o provider mercadopago", () => {
    assert.ok(listSupportedPaymentProviders().includes("mercadopago"));
    const provider = createPaymentProvider("mercadopago", { accessToken: "APP_USR-fake" });
    assert.equal(provider.code, "mercadopago");
});

test("provider desconhecido lança erro explícito", () => {
    assert.throws(() => createPaymentProvider("inexistente", {}), /Unknown payment provider: inexistente/);
});

test("mock: createCharge de pix devolve qr code e copia-e-cola", async () => {
    const provider = createPaymentProvider("mock", {});
    const charge = await provider.createCharge({
        amount: 100,
        method: "pix",
        orderId: "order-1",
        customer: { name: "Cliente Teste", document: "00000000000", email: "cliente@teste.com" },
    });
    assert.equal(charge.method, "pix");
    if (charge.method === "pix") {
        assert.ok(charge.qrCode);
        assert.ok(charge.copyPaste);
        assert.ok(charge.expiresAt instanceof Date);
    }
});

test("mock: createCharge de cartão sem token falha", async () => {
    const provider = createPaymentProvider("mock", {});
    const charge = await provider.createCharge({
        amount: 100,
        method: "cartao",
        orderId: "order-1",
        customer: { name: "Cliente Teste", document: "00000000000", email: "cliente@teste.com" },
    });
    assert.equal(charge.method, "cartao");
    if (charge.method === "cartao") assert.equal(charge.status, "failed");
});

test("mock: createCharge de cartão com token autoriza", async () => {
    const provider = createPaymentProvider("mock", {});
    const charge = await provider.createCharge({
        amount: 100,
        method: "cartao",
        orderId: "order-1",
        customer: { name: "Cliente Teste", document: "00000000000", email: "cliente@teste.com" },
        cardToken: "tok_abc",
    });
    assert.equal(charge.method, "cartao");
    if (charge.method === "cartao") assert.equal(charge.status, "authorized");
});

test("mock: parseWebhook ignora payload sem externalId", () => {
    const provider = createPaymentProvider("mock", {});
    assert.equal(provider.parseWebhook(JSON.stringify({ status: "paid" }), {}), null);
});

test("mock: parseWebhook normaliza payload válido", () => {
    const provider = createPaymentProvider("mock", {});
    const event = provider.parseWebhook(JSON.stringify({ externalId: "mock-charge-1", status: "paid" }), {});
    assert.deepEqual(event?.externalId, "mock-charge-1");
    assert.equal(event?.status, "paid");
});
