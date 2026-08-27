import assert from "node:assert/strict";
import test from "node:test";
import type { OrderSessionRow } from "@/models/ordersModel";
import { diffCartItems, toOrderSession } from "./orderMapper";

function fakeRow(overrides: Partial<OrderSessionRow> = {}): OrderSessionRow {
    return {
        id: "session-1",
        order_book_id: "book-1",
        client_name: "Sem cliente",
        client_id: null,
        seller_id: "seller-1",
        channel: "presencial",
        status: "aberto",
        order_id: null,
        shipping: undefined,
        payment_token_created_at: null,
        notes: null,
        created_at: new Date("2026-01-01T00:00:00.000Z"),
        updated_at: new Date("2026-01-01T00:00:00.000Z"),
        ...overrides,
    };
}

// Bloqueador B3 do plano de realtime incremental: toOrderSession NUNCA pode
// preencher paymentToken -- é o que impede o token do link de cobrança
// (que É a autenticação desse link, sem exigir login) de vazar pras rooms
// do /atualizacoes agora que o payload da sessão viaja no evento.
test("toOrderSession nunca preenche paymentToken", () => {
    const row = fakeRow({ payment_token_created_at: new Date("2026-01-02T00:00:00.000Z") });
    const session = toOrderSession(row, []);
    assert.equal("paymentToken" in session, false);
    assert.equal(session.paymentTokenCreatedAt, "2026-01-02T00:00:00.000Z");
});

test("diffCartItems detecta item novo, removido e qty alterada", () => {
    const before = [
        { key: "a", id: "a", name: "Peça A", price: 10, qty: 1 },
        { key: "b", id: "b", name: "Peça B", price: 20, qty: 2 },
    ];
    const after = [
        { key: "a", id: "a", name: "Peça A", price: 10, qty: 3 }, // qty mudou
        { key: "c", id: "c", name: "Peça C", price: 30, qty: 1 }, // nova
    ];
    const { set, del } = diffCartItems(before, after);
    assert.deepEqual(set.map((item) => item.key).sort(), ["a", "c"]);
    assert.deepEqual(del, ["b"]);
});

test("diffCartItems não marca nada quando nada mudou", () => {
    const items = [{ key: "a", id: "a", name: "Peça A", price: 10, qty: 1 }];
    const { set, del } = diffCartItems(items, items);
    assert.deepEqual(set, []);
    assert.deepEqual(del, []);
});
