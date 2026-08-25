import type { PoolClient } from "pg";

export interface ClientAccountConfirmationRow {
    id: string;
    client_id: string;
    password_hash: string;
    token_hash: string;
    expires_at: Date;
}

const fields = "id, client_id, password_hash, token_hash, expires_at";

export async function upsertClientAccountConfirmationRow(
    client: PoolClient,
    value: { clientId: string; passwordHash: string; tokenHash: string; expiresAt: Date },
): Promise<void> {
    await client.query(
        `INSERT INTO client_account_confirmations
          (tenant_id, client_id, password_hash, token_hash, expires_at)
         VALUES (app_tenant_id(), $1, $2, $3, $4)
         ON CONFLICT (tenant_id, client_id) DO UPDATE SET
           password_hash = EXCLUDED.password_hash,
           token_hash = EXCLUDED.token_hash,
           expires_at = EXCLUDED.expires_at,
           created_at = now()`,
        [value.clientId, value.passwordHash, value.tokenHash, value.expiresAt],
    );
}

export async function findClientAccountConfirmationByTokenHash(
    client: PoolClient,
    tokenHash: string,
): Promise<ClientAccountConfirmationRow | null> {
    const result = await client.query<ClientAccountConfirmationRow>(
        `SELECT ${fields} FROM client_account_confirmations
         WHERE tenant_id = app_tenant_id() AND token_hash = $1`,
        [tokenHash],
    );
    return result.rows[0] ?? null;
}

export async function deleteClientAccountConfirmationRow(client: PoolClient, id: string): Promise<void> {
    await client.query(
        `DELETE FROM client_account_confirmations
         WHERE tenant_id = app_tenant_id() AND id = $1`,
        [id],
    );
}
