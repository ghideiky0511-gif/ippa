import assert from "node:assert/strict";
import test from "node:test";
import { canMutateLinkedOrder, totalAfterItemMutation } from "./orderSessionService";

test("a vendedora pode fazer upsell em pedido confirmado", () => {
    assert.equal(canMutateLinkedOrder("novo", false), true);
    assert.equal(canMutateLinkedOrder("separado", false), true);
    assert.equal(canMutateLinkedOrder("pago", false), true);
});

test("a cliente não pode limpar o pedido depois do checkout", () => {
    assert.equal(canMutateLinkedOrder("aberto", true), true);
    assert.equal(canMutateLinkedOrder("aguardando_pagamento", true), true);
    assert.equal(canMutateLinkedOrder("novo", true), false);
    assert.equal(canMutateLinkedOrder("pago", true), false);
});

test("pedido cancelado não aceita mutação de nenhuma origem", () => {
    assert.equal(canMutateLinkedOrder("cancelado", false), false);
    assert.equal(canMutateLinkedOrder("cancelado", true), false);
});

test("upsell recalcula total preservando desconto e frete do pedido", () => {
    const total = totalAfterItemMutation(
        [{ price: 100, qty: 2 }, { price: 75.5, qty: 1 }],
        { discount: { label: "Comercial", amount: 25 }, shipping: { id: "entrega", label: "Entrega", prazo: "3 dias", price: 20 } },
    );
    assert.equal(total, 270.5);
});
