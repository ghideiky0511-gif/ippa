import type { PoolClient } from "pg";

export interface SessionRow { id: string; user_id: string }

export async function insertSessionRow(client: PoolClient, userId: string, tokenHash: string, expiresAt: Date): Promise<SessionRow> {
    const result = await client.query<SessionRow>(
        `INSERT INTO user_sessions (tenant_id, user_id, token_hash, expires_at)
         VALUES (app_tenant_id(), $1, $2, $3) RETURNING id, user_id`,
        [userId, tokenHash, expiresAt],
    );
    return result.rows[0];
}

export async function findActiveSessionRow(client: PoolClient, tokenHash: string): Promise<SessionRow | null> {
    const result = await client.query<SessionRow>(
        `SELECT id, user_id FROM user_sessions
         WHERE tenant_id = app_tenant_id() AND token_hash = $1
           AND expires_at > now() AND revoked_at IS NULL`, [tokenHash],
    );
    return result.rows[0] ?? null;
}

export async function revokeSessionRow(client: PoolClient, tokenHash: string): Promise<void> {
    await client.query(
        `UPDATE user_sessions SET revoked_at = now()
         WHERE tenant_id = app_tenant_id() AND token_hash = $1 AND revoked_at IS NULL`, [tokenHash],
    );
}
