import assert from "node:assert/strict";
import test from "node:test";
import type { CartItem } from "@/contracts/shared";
import { isExemptFromStockGate } from "./stockGate";

function fakeItem(overrides: Partial<CartItem> = {}): CartItem {
    return {
        key: "item-1",
        id: "product-1",
        name: "Vestido",
        color: "Preto",
        size: "M",
        price: 100,
        qty: 3,
        ...overrides,
    };
}

test("item com backorderDate é isento do gate de estoque ao vivo (pré-venda já aceita)", () => {
    assert.equal(isExemptFromStockGate(fakeItem({ backorderDate: "Em 30 dias" })), true);
});

test("item sem backorderDate continua sujeito ao gate (pronta entrega)", () => {
    assert.equal(isExemptFromStockGate(fakeItem()), false);
});
