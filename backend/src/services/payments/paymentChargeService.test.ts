import assert from "node:assert/strict";
import test from "node:test";
import { ValidationError } from "@/services/shared/errors";
import type { PaymentChargeRow } from "@/models/paymentChargesModel";
import { assertOrderChargeable, extractInternalChargeId, mapChargeStatusToOrderPaymentUpdate, toOrderPaymentCharge } from "./paymentChargeService";

// STRIPE_SECRET_KEY precisa existir antes do primeiro getStripeClient() --
// mesmo raciocínio de providers/stripe/index.test.ts. toOrderPaymentCharge
// não chama a Stripe, mas importa o módulo do provider (dispatch por
// row.provider), que instancia o client lazy só quando efetivamente usado.
process.env.STRIPE_SECRET_KEY = "sk_test_fake";

function fakeChargeRow(overrides: Partial<PaymentChargeRow> = {}): PaymentChargeRow {
    return {
        id: "11111111-1111-1111-1111-111111111111",
        tenant_id: "22222222-2222-2222-2222-222222222222",
        integration_id: "33333333-3333-3333-3333-333333333333",
        provider: "stripe",
        order_id: "44444444-4444-4444-4444-444444444444",
        method: "cartao",
        status: "paid",
        amount: "45.00",
        external_id: "pi_123",
        external_status: "succeeded",
        card_last_digits: "4242",
        card_brand: "visa",
        pix_qr_code: null,
        pix_copy_paste: null,
        provider_expires_at: null,
        raw_create_response: {},
        raw_last_webhook: {},
        next_check_at: null,
        paid_at: new Date("2026-09-01T16:30:17.000Z"),
        created_at: new Date("2026-09-01T16:30:16.000Z"),
        updated_at: new Date("2026-09-01T16:30:17.000Z"),
        ...overrides,
    };
}

test("extractInternalChargeId lê metadata.charge_id de um PaymentIntent", () => {
    assert.equal(
        extractInternalChargeId({ id: "pi_1", metadata: { charge_id: "11111111-1111-1111-1111-111111111111" } }),
        "11111111-1111-1111-1111-111111111111",
    );
});

test("extractInternalChargeId devolve undefined sem metadata.charge_id", () => {
    assert.equal(extractInternalChargeId({ id: "pi_1", metadata: {} }), undefined);
    assert.equal(extractInternalChargeId({ id: "pi_1" }), undefined);
    assert.equal(extractInternalChargeId({ id: "pi_1", metadata: { charge_id: "" } }), undefined);
});

test("mapChargeStatusToOrderPaymentUpdate: paid avança status até pago", () => {
    assert.deepEqual(mapChargeStatusToOrderPaymentUpdate("paid"), {
        paymentStatus: "paid",
        advanceStatusTo: "pago",
    });
});

test("mapChargeStatusToOrderPaymentUpdate: failed/cancelled/expired viram payment_failed", () => {
    for (const status of ["failed", "cancelled", "expired"]) {
        assert.deepEqual(mapChargeStatusToOrderPaymentUpdate(status), { paymentStatus: "payment_failed" });
    }
});

test("mapChargeStatusToOrderPaymentUpdate: authorized/processing viram awaiting_confirmation", () => {
    for (const status of ["authorized", "processing"]) {
        assert.deepEqual(mapChargeStatusToOrderPaymentUpdate(status), { paymentStatus: "awaiting_confirmation" });
    }
});

test("mapChargeStatusToOrderPaymentUpdate: pending não move a trilha financeira do pedido", () => {
    assert.equal(mapChargeStatusToOrderPaymentUpdate("pending"), null);
});

test("assertOrderChargeable: rejeita pedido sem itens", () => {
    assert.throws(
        () => assertOrderChargeable([]),
        (error: unknown) => error instanceof ValidationError && error.code === "ORDER_HAS_NO_ITEMS",
    );
});

test("assertOrderChargeable: rejeita item com separação incompleta", () => {
    assert.throws(
        () =>
            assertOrderChargeable([
                { item_key: "a", qty: 2, qty_separated: 2 },
                { item_key: "b", qty: 3, qty_separated: 1 },
            ]),
        (error: unknown) => error instanceof ValidationError && error.code === "ORDER_ITEMS_NOT_SEPARATED",
    );
});

test("assertOrderChargeable: aceita pedido com todos os itens totalmente separados", () => {
    assert.doesNotThrow(() =>
        assertOrderChargeable([
            { item_key: "a", qty: 2, qty_separated: 2 },
            { item_key: "b", qty: 1, qty_separated: 1 },
        ]),
    );
});

test("toOrderPaymentCharge: cobrança Stripe paga extrai NSU/parcelas do raw_create_response", () => {
    const row = fakeChargeRow({
        raw_create_response: {
            latest_charge: {
                payment_method_details: {
                    card: { network_transaction_id: "116728512090991", installments: { plan: { count: 2 } } },
                },
            },
        },
    });
    assert.deepEqual(toOrderPaymentCharge(row), {
        id: row.id,
        provider: "stripe",
        method: "cartao",
        status: "paid",
        amount: 45,
        createdAt: row.created_at.toISOString(),
        paidAt: row.paid_at!.toISOString(),
        failureReason: undefined,
        card: { lastDigits: "4242", brand: "visa", installments: 2, nsu: "116728512090991" },
        pix: undefined,
    });
});

test("toOrderPaymentCharge: sem raw expandido cai pro default de 1 parcela e sem NSU", () => {
    const charge = toOrderPaymentCharge(fakeChargeRow());
    assert.deepEqual(charge.card, { lastDigits: "4242", brand: "visa", installments: 1, nsu: undefined });
});

test("toOrderPaymentCharge: cobrança falhada extrai failureReason do erro embrulhado", () => {
    const charge = toOrderPaymentCharge(
        fakeChargeRow({ status: "failed", paid_at: null, raw_create_response: { error: "No such PaymentMethod" } }),
    );
    assert.equal(charge.status, "failed");
    assert.equal(charge.failureReason, "No such PaymentMethod");
    assert.equal(charge.paidAt, null);
});

test("toOrderPaymentCharge: provider desconhecido não quebra -- cartão sem NSU, 1 parcela por default", () => {
    const charge = toOrderPaymentCharge(fakeChargeRow({ provider: "mock" }));
    assert.deepEqual(charge.card, { lastDigits: "4242", brand: "visa", installments: 1 });
});

test("toOrderPaymentCharge: método não-cartão não gera bloco card", () => {
    const charge = toOrderPaymentCharge(fakeChargeRow({ method: "pix", card_last_digits: null, card_brand: null }));
    assert.equal(charge.card, undefined);
});
