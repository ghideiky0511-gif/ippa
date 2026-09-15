import type { PoolClient } from "pg";

export interface ErpIntegrationRow {
    id: string; provider: string; credentials: Record<string, unknown>;
    active: boolean; created_at: Date; updated_at: Date;
    cached_access_token: string | null; cached_access_token_expires_at: Date | null;
}

export interface ErpIntegrationWriteRow {
    provider: string; credentials: Record<string, unknown>;
}

const integrationFields =
    "id, provider, credentials, active, created_at, updated_at, cached_access_token, cached_access_token_expires_at";

export async function findActiveErpIntegrationRow(client: PoolClient): Promise<ErpIntegrationRow | null> {
    const result = await client.query<ErpIntegrationRow>(
        `SELECT ${integrationFields} FROM tenant_erp_integrations WHERE tenant_id = app_tenant_id() AND active LIMIT 1`,
    );
    return result.rows[0] ?? null;
}

export async function findErpIntegrationRowByProvider(client: PoolClient, provider: string): Promise<ErpIntegrationRow | null> {
    const result = await client.query<ErpIntegrationRow>(
        `SELECT ${integrationFields} FROM tenant_erp_integrations WHERE tenant_id = app_tenant_id() AND provider = $1 LIMIT 1`,
        [provider],
    );
    return result.rows[0] ?? null;
}

export async function listErpIntegrationRows(client: PoolClient): Promise<ErpIntegrationRow[]> {
    const result = await client.query<ErpIntegrationRow>(
        `SELECT ${integrationFields} FROM tenant_erp_integrations WHERE tenant_id = app_tenant_id() ORDER BY provider`,
    );
    return result.rows;
}

// Salva/atualiza credenciais de um provider sem mexer em `active` — uma
// linha estável por (tenant_id, provider) (ver migration 018), diferente do
// upsert antigo que inseria uma linha nova a cada chamada e quebrava a
// reconciliação de erp_external_references ao trocar de provider.
export async function upsertErpIntegrationCredentialsRow(client: PoolClient, value: ErpIntegrationWriteRow): Promise<ErpIntegrationRow> {
    const result = await client.query<ErpIntegrationRow>(
        `INSERT INTO tenant_erp_integrations (tenant_id, provider, credentials, active)
         VALUES (app_tenant_id(), $1, $2, false)
         ON CONFLICT (tenant_id, provider)
         DO UPDATE SET credentials = EXCLUDED.credentials, updated_at = now(),
                       cached_access_token = NULL, cached_access_token_expires_at = NULL
         RETURNING ${integrationFields}`,
        [value.provider, JSON.stringify(value.credentials)],
    );
    return result.rows[0];
}

// Ativa a linha já existente de `provider` (precisa ter credenciais salvas
// antes) e desativa qualquer outra que estivesse ativa. Retorna null se o
// provider não tem credenciais salvas — o service traduz isso em erro de
// validação.
export async function activateErpIntegrationRow(client: PoolClient, provider: string): Promise<ErpIntegrationRow | null> {
    await client.query(
        "UPDATE tenant_erp_integrations SET active = false, updated_at = now() WHERE tenant_id = app_tenant_id() AND active AND provider <> $1",
        [provider],
    );
    const result = await client.query<ErpIntegrationRow>(
        `UPDATE tenant_erp_integrations SET active = true, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND provider = $1
         RETURNING ${integrationFields}`,
        [provider],
    );
    return result.rows[0] ?? null;
}

// Grava o token de acesso obtido do ERP e sua expiração (ver
// services/erp/erpProviderFactory.ts, chamado pelo próprio provider quando
// reautentica) -- não bate updated_at de propósito, já que isto é cache
// interno, não uma mudança de configuração que deva aparecer como "editado"
// na UI de integrações.
export async function updateErpIntegrationTokenCacheRow(
    client: PoolClient,
    integrationId: string,
    token: string,
    expiresAt: Date | null,
): Promise<void> {
    await client.query(
        `UPDATE tenant_erp_integrations SET cached_access_token = $2, cached_access_token_expires_at = $3
         WHERE tenant_id = app_tenant_id() AND id = $1`,
        [integrationId, token, expiresAt],
    );
}

// Desliga o ERP inteiro (nenhum provider ativo) sem apagar credenciais
// salvas. Idempotente: retorna null se já não havia nada ativo.
export async function deactivateErpIntegrationRow(client: PoolClient): Promise<ErpIntegrationRow | null> {
    const result = await client.query<ErpIntegrationRow>(
        `UPDATE tenant_erp_integrations SET active = false, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND active
         RETURNING ${integrationFields}`,
    );
    return result.rows[0] ?? null;
}
