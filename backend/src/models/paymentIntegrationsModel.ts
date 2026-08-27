import type { PoolClient } from "pg";
import { decryptPaymentCredentials, encryptPaymentCredentials } from "@/lib/crypto/paymentCredentials";

export interface PaymentIntegrationRow {
    id: string;
    provider: string;
    credentials: Record<string, unknown>;
    credentials_meta: Record<string, unknown>;
    active: boolean;
    webhook_secret: string | null;
    created_at: Date;
    updated_at: Date;
}

interface PaymentIntegrationRawRow {
    id: string;
    provider: string;
    credentials_encrypted: Buffer;
    credentials_meta: Record<string, unknown>;
    active: boolean;
    webhook_secret: string | null;
    created_at: Date;
    updated_at: Date;
}

export interface PaymentIntegrationWriteRow {
    provider: string;
    credentials: Record<string, unknown>;
    credentialsMeta: Record<string, unknown>;
}

const integrationFields =
    "id, provider, credentials_encrypted, credentials_meta, active, webhook_secret, created_at, updated_at";

// Decifra na borda do model (nunca antes) -- quem chama já recebe
// `credentials` em claro, mas a linha nunca fica em claro fora deste
// arquivo (ver lib/crypto/paymentCredentials.ts).
function toRow(raw: PaymentIntegrationRawRow): PaymentIntegrationRow {
    return {
        id: raw.id,
        provider: raw.provider,
        credentials: decryptPaymentCredentials(raw.credentials_encrypted),
        credentials_meta: raw.credentials_meta,
        active: raw.active,
        webhook_secret: raw.webhook_secret,
        created_at: raw.created_at,
        updated_at: raw.updated_at,
    };
}

export async function findActivePaymentIntegrationRow(client: PoolClient): Promise<PaymentIntegrationRow | null> {
    const result = await client.query<PaymentIntegrationRawRow>(
        `SELECT ${integrationFields} FROM tenant_payment_integrations WHERE tenant_id = app_tenant_id() AND active LIMIT 1`,
    );
    return result.rows[0] ? toRow(result.rows[0]) : null;
}

export async function findPaymentIntegrationRowByProvider(
    client: PoolClient,
    provider: string,
): Promise<PaymentIntegrationRow | null> {
    const result = await client.query<PaymentIntegrationRawRow>(
        `SELECT ${integrationFields} FROM tenant_payment_integrations WHERE tenant_id = app_tenant_id() AND provider = $1 LIMIT 1`,
        [provider],
    );
    return result.rows[0] ? toRow(result.rows[0]) : null;
}

export async function listPaymentIntegrationRows(client: PoolClient): Promise<PaymentIntegrationRow[]> {
    const result = await client.query<PaymentIntegrationRawRow>(
        `SELECT ${integrationFields} FROM tenant_payment_integrations WHERE tenant_id = app_tenant_id() ORDER BY provider`,
    );
    return result.rows.map(toRow);
}

// Salva/atualiza credenciais de um provider sem mexer em `active` -- mesmo
// raciocínio de upsertErpIntegrationCredentialsRow (uma linha estável por
// (tenant_id, provider), nunca acumula histórico).
export async function upsertPaymentIntegrationCredentialsRow(
    client: PoolClient,
    value: PaymentIntegrationWriteRow,
): Promise<PaymentIntegrationRow> {
    const encrypted = encryptPaymentCredentials(value.credentials);
    const result = await client.query<PaymentIntegrationRawRow>(
        `INSERT INTO tenant_payment_integrations (tenant_id, provider, credentials_encrypted, credentials_meta, active)
         VALUES (app_tenant_id(), $1, $2, $3, false)
         ON CONFLICT (tenant_id, provider)
         DO UPDATE SET credentials_encrypted = EXCLUDED.credentials_encrypted,
                       credentials_meta = EXCLUDED.credentials_meta,
                       updated_at = now()
         RETURNING ${integrationFields}`,
        [value.provider, encrypted, JSON.stringify(value.credentialsMeta)],
    );
    return toRow(result.rows[0]);
}

// Ativa a linha já existente de `provider` (precisa ter credenciais salvas
// antes) e desativa qualquer outra que estivesse ativa. Retorna null se o
// provider não tem credenciais salvas -- o service traduz isso em erro de
// validação.
export async function activatePaymentIntegrationRow(client: PoolClient, provider: string): Promise<PaymentIntegrationRow | null> {
    await client.query(
        "UPDATE tenant_payment_integrations SET active = false, updated_at = now() WHERE tenant_id = app_tenant_id() AND active AND provider <> $1",
        [provider],
    );
    const result = await client.query<PaymentIntegrationRawRow>(
        `UPDATE tenant_payment_integrations SET active = true, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND provider = $1
         RETURNING ${integrationFields}`,
        [provider],
    );
    return result.rows[0] ? toRow(result.rows[0]) : null;
}

// Desliga o gateway inteiro (nenhum provider ativo) sem apagar credenciais
// salvas. Idempotente: retorna null se já não havia nada ativo.
export async function deactivatePaymentIntegrationRow(client: PoolClient): Promise<PaymentIntegrationRow | null> {
    const result = await client.query<PaymentIntegrationRawRow>(
        `UPDATE tenant_payment_integrations SET active = false, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND active
         RETURNING ${integrationFields}`,
    );
    return result.rows[0] ? toRow(result.rows[0]) : null;
}
