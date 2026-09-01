import assert from "node:assert/strict";
import test from "node:test";
import { extractInternalChargeId, mapChargeStatusToOrderPaymentUpdate } from "./paymentChargeService";

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

test("mapChargeStatusToOrderPaymentUpdate: paid avança status pra novo", () => {
    assert.deepEqual(mapChargeStatusToOrderPaymentUpdate("paid"), {
        paymentStatus: "paid",
        advanceToNovo: true,
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
