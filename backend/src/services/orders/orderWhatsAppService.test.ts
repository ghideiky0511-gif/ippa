import assert from "node:assert/strict";
import test from "node:test";
import { maskWhatsAppPhone, SendOrderWhatsAppInputSchema } from "./orderWhatsAppService";

test("accepts only the three supported WhatsApp actions", () => {
    assert.equal(SendOrderWhatsAppInputSchema.safeParse({ kind: "order" }).success, true);
    assert.equal(SendOrderWhatsAppInputSchema.safeParse({ kind: "payment_link" }).success, true);
    assert.equal(SendOrderWhatsAppInputSchema.safeParse({ kind: "payment_order" }).success, true);
    assert.equal(SendOrderWhatsAppInputSchema.safeParse({ kind: "free_text" }).success, false);
});

test("masks the phone before returning it to the frontend", () => {
    assert.equal(maskWhatsAppPhone("+5511999991234"), "+55 *****-1234");
});
