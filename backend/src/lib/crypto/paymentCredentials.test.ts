import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { decryptPaymentCredentials, encryptPaymentCredentials } from "./paymentCredentials";

test("round-trip: decifra exatamente o que foi cifrado", () => {
    process.env.PAYMENT_CREDENTIALS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    const original = { apiKey: "live_abc123", accountId: "acc_1", testMode: false };
    const encrypted = encryptPaymentCredentials(original);
    assert.ok(Buffer.isBuffer(encrypted));
    const decrypted = decryptPaymentCredentials(encrypted);
    assert.deepEqual(decrypted, original);
});

test("duas cifragens da mesma credencial produzem ciphertexts diferentes (IV aleatório)", () => {
    process.env.PAYMENT_CREDENTIALS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    const credentials = { apiKey: "live_abc123" };
    const first = encryptPaymentCredentials(credentials);
    const second = encryptPaymentCredentials(credentials);
    assert.notEqual(first.toString("hex"), second.toString("hex"));
});

test("decifrar com a chave errada falha em vez de devolver lixo", () => {
    process.env.PAYMENT_CREDENTIALS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    const encrypted = encryptPaymentCredentials({ apiKey: "live_abc123" });
    process.env.PAYMENT_CREDENTIALS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    assert.throws(() => decryptPaymentCredentials(encrypted));
});

test("sem PAYMENT_CREDENTIALS_ENCRYPTION_KEY configurada, lança erro claro", () => {
    delete process.env.PAYMENT_CREDENTIALS_ENCRYPTION_KEY;
    assert.throws(
        () => encryptPaymentCredentials({ apiKey: "x" }),
        /PAYMENT_CREDENTIALS_ENCRYPTION_KEY/,
    );
});
