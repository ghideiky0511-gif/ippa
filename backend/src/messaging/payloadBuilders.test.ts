import assert from "node:assert/strict";
import test from "node:test";
import { toWaId } from "./payloadBuilders";

test("toWaId remove o + de um telefone E.164 válido", () => {
    assert.equal(toWaId("+5511999999999"), "5511999999999");
});

test("toWaId rejeita telefone fora do formato E.164", () => {
    assert.throws(() => toWaId("11999999999"), /E\.164/);
    assert.throws(() => toWaId("+55 11 99999-9999"), /E\.164/);
    assert.throws(() => toWaId(""), /E\.164/);
});
