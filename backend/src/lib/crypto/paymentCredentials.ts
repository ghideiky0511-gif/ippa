import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Criptografia em repouso das credenciais de gateway de pagamento
// (tenant_payment_integrations.credentials_encrypted, migration 044) --
// diferente de tenant_erp_integrations, que guarda credentials em jsonb
// claro (tradeoff aceito lá, ver migration 018): aqui a credencial move
// dinheiro de verdade, então cifra na aplicação em vez de confiar só em RLS.
// AES-256-GCM na aplicação (não pgcrypto) para a chave nunca trafegar em
// SQL/log de query e para o round-trip ser testável sem banco.
//
// Layout do buffer persistido: IV (12 bytes) || auth tag (16 bytes) ||
// ciphertext. A chave vem só de PAYMENT_CREDENTIALS_ENCRYPTION_KEY (.env),
// nunca do banco -- ver .env.example.

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function encryptionKey(): Buffer {
    const raw = process.env.PAYMENT_CREDENTIALS_ENCRYPTION_KEY;
    if (!raw) {
        throw new Error(
            "PAYMENT_CREDENTIALS_ENCRYPTION_KEY não configurada -- necessária para salvar/ler credenciais de pagamento.",
        );
    }
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) {
        throw new Error(
            "PAYMENT_CREDENTIALS_ENCRYPTION_KEY inválida -- espera 32 bytes em base64 (gere com `openssl rand -base64 32`).",
        );
    }
    return key;
}

export function encryptPaymentCredentials(credentials: Record<string, unknown>): Buffer {
    const key = encryptionKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const plaintext = Buffer.from(JSON.stringify(credentials), "utf8");
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, ciphertext]);
}

export function decryptPaymentCredentials(encrypted: Buffer): Record<string, unknown> {
    const key = encryptionKey();
    const iv = encrypted.subarray(0, IV_LENGTH);
    const authTag = encrypted.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = encrypted.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString("utf8"));
}
