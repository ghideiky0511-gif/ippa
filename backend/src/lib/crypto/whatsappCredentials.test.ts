import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { decryptWhatsAppAccessToken, encryptWhatsAppAccessToken } from "./whatsappCredentials";

test("round-trip: decifra exatamente o que foi cifrado", () => {
    process.env.WHATSAPP_CREDENTIALS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    const original = "EAAG...long-lived-system-user-token";
    const encrypted = encryptWhatsAppAccessToken(original);
    assert.ok(Buffer.isBuffer(encrypted));
    const decrypted = decryptWhatsAppAccessToken(encrypted);
    assert.equal(decrypted, original);
});

test("duas cifragens do mesmo token produzem ciphertexts diferentes (IV aleatório)", () => {
    process.env.WHATSAPP_CREDENTIALS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    const token = "EAAG...token";
    const first = encryptWhatsAppAccessToken(token);
    const second = encryptWhatsAppAccessToken(token);
    assert.notEqual(first.toString("hex"), second.toString("hex"));
});

test("decifrar com a chave errada falha em vez de devolver lixo", () => {
    process.env.WHATSAPP_CREDENTIALS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    const encrypted = encryptWhatsAppAccessToken("EAAG...token");
    process.env.WHATSAPP_CREDENTIALS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    assert.throws(() => decryptWhatsAppAccessToken(encrypted));
});

test("sem WHATSAPP_CREDENTIALS_ENCRYPTION_KEY configurada, lança erro claro", () => {
    delete process.env.WHATSAPP_CREDENTIALS_ENCRYPTION_KEY;
    assert.throws(
        () => encryptWhatsAppAccessToken("x"),
        /WHATSAPP_CREDENTIALS_ENCRYPTION_KEY/,
    );
});
