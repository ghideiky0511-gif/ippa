import type { PoolClient } from "pg";

export interface ErpIntegrationRow {
    id: string; provider: string; credentials: Record<string, unknown>;
    active: boolean; created_at: Date; updated_at: Date;
}

export interface ErpIntegrationWriteRow {
    provider: string; credentials: Record<string, unknown>;
}

const integrationFields = "id, provider, credentials, active, created_at, updated_at";

export async function findActiveErpIntegrationRow(client: PoolClient): Promise<ErpIntegrationRow | null> {
    const result = await client.query<ErpIntegrationRow>(
        `SELECT ${integrationFields} FROM tenant_erp_integrations WHERE tenant_id = app_tenant_id() AND active LIMIT 1`,
    );
    return result.rows[0] ?? null;
}

// Desativa a integração ativa anterior (se houver) e insere a nova como
// ativa, dentro da mesma transação — só uma integração ativa por tenant.
export async function upsertActiveErpIntegrationRow(client: PoolClient, value: ErpIntegrationWriteRow): Promise<ErpIntegrationRow> {
    await client.query(
        "UPDATE tenant_erp_integrations SET active = false, updated_at = now() WHERE tenant_id = app_tenant_id() AND active",
    );
    const result = await client.query<ErpIntegrationRow>(
        `INSERT INTO tenant_erp_integrations (tenant_id, provider, credentials, active)
         VALUES (app_tenant_id(), $1, $2, true)
         RETURNING ${integrationFields}`,
        [value.provider, JSON.stringify(value.credentials)],
    );
    return result.rows[0];
}
