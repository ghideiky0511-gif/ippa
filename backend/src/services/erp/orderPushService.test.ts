import assert from "node:assert/strict";
import test from "node:test";
import type { CartItem } from "@/contracts/shared";
import type { ErpStockSnapshot } from "@/erp/types";
import { assertProductCodesInStock, buildProviderOrderIdempotencyKey } from "./orderPushService";

function cartItem(overrides: Partial<CartItem> & Pick<CartItem, "key" | "id" | "qty">): CartItem {
    return { name: "Peça", price: 100, color: "PRETO", size: "M", ...overrides };
}

function fakeProvider(snapshots: ErpStockSnapshot[]) {
    return { fetchStock: async (_codes: string[]) => snapshots };
}

test("soma saldo por productCode entre múltiplos depósitos", async () => {
    const items = [cartItem({ key: "a:1", id: "a", qty: 5 })];
    const provider = fakeProvider([
        { skuExternalId: "111", locationExternalId: "LOJA1", quantity: 2 },
        { skuExternalId: "111", locationExternalId: "LOJA2", quantity: 3 },
    ]);
    await assert.doesNotReject(() =>
        assertProductCodesInStock(provider, items, { "a:1": "111" }),
    );
});

test("lança quando a soma do saldo é menor que a quantidade pedida", async () => {
    const items = [cartItem({ key: "a:1", id: "a", qty: 5 })];
    const provider = fakeProvider([{ skuExternalId: "111", locationExternalId: "LOJA1", quantity: 4 }]);
    await assert.rejects(
        () => assertProductCodesInStock(provider, items, { "a:1": "111" }),
        /Estoque insuficiente/,
    );
});

test("ignora item sem productCode resolvido (não é responsabilidade deste gate)", async () => {
    const items = [cartItem({ key: "a:1", id: "a", qty: 5 })];
    const provider = fakeProvider([]);
    await assert.doesNotReject(() => assertProductCodesInStock(provider, items, {}));
});

test("não repete a chamada de fetchStock por productCode duplicado entre itens", async () => {
    const items = [
        cartItem({ key: "a:1", id: "a", qty: 2 }),
        cartItem({ key: "a:2", id: "a", qty: 2 }),
    ];
    let receivedCodes: string[] = [];
    const provider = {
        fetchStock: async (codes: string[]) => {
            receivedCodes = codes;
            return [{ skuExternalId: "111", locationExternalId: "LOJA1", quantity: 10 }];
        },
    };
    await assertProductCodesInStock(provider, items, { "a:1": "111", "a:2": "111" });
    assert.deepEqual(receivedCodes, ["111"]);
});

test("monta código de integração com marca, número do pedido e versão com 2 dígitos", () => {
    const original = process.env.APP_COMERCIAL_NAME_INTEGRATION;
    process.env.APP_COMERCIAL_NAME_INTEGRATION = "BIPPA";
    try {
        assert.equal(buildProviderOrderIdempotencyKey(1042, 1), "BIPPA1042_01");
        assert.equal(buildProviderOrderIdempotencyKey(1042, 12), "BIPPA1042_12");
    } finally {
        if (original === undefined) delete process.env.APP_COMERCIAL_NAME_INTEGRATION;
        else process.env.APP_COMERCIAL_NAME_INTEGRATION = original;
    }
});

test("sanitiza a marca (maiúsculas, sem espaço/acento) e degrada sem env configurada", () => {
    const original = process.env.APP_COMERCIAL_NAME_INTEGRATION;
    try {
        process.env.APP_COMERCIAL_NAME_INTEGRATION = "bippa catálogo";
        assert.equal(buildProviderOrderIdempotencyKey(7, 1), "BIPPACATLOGO7_01");

        delete process.env.APP_COMERCIAL_NAME_INTEGRATION;
        assert.equal(buildProviderOrderIdempotencyKey(7, 1), "7_01");
    } finally {
        if (original === undefined) delete process.env.APP_COMERCIAL_NAME_INTEGRATION;
        else process.env.APP_COMERCIAL_NAME_INTEGRATION = original;
    }
});
