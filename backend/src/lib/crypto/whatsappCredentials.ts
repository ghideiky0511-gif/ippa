import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Criptografia em repouso do access token de WhatsApp Business
// (seller_whatsapp_integrations.access_token_encrypted, migration 056) --
// mesmo desenho de lib/crypto/paymentCredentials.ts (AES-256-GCM na
// aplicação, chave nunca em SQL/log, round-trip testável sem banco), com
// chave própria (WHATSAPP_CREDENTIALS_ENCRYPTION_KEY) para isolar o blast
// radius de comprometimento de chave entre os dois domínios.
//
// Layout do buffer persistido: IV (12 bytes) || auth tag (16 bytes) ||
// ciphertext.

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function encryptionKey(): Buffer {
    const raw = process.env.WHATSAPP_CREDENTIALS_ENCRYPTION_KEY;
    if (!raw) {
        throw new Error(
            "WHATSAPP_CREDENTIALS_ENCRYPTION_KEY não configurada -- necessária para salvar/ler o token de WhatsApp.",
        );
    }
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) {
        throw new Error(
            "WHATSAPP_CREDENTIALS_ENCRYPTION_KEY inválida -- espera 32 bytes em base64 (gere com `openssl rand -base64 32`).",
        );
    }
    return key;
}

export function encryptWhatsAppAccessToken(accessToken: string): Buffer {
    const key = encryptionKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const plaintext = Buffer.from(accessToken, "utf8");
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, ciphertext]);
}

export function decryptWhatsAppAccessToken(encrypted: Buffer): string {
    const key = encryptionKey();
    const iv = encrypted.subarray(0, IV_LENGTH);
    const authTag = encrypted.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = encrypted.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString("utf8");
}
