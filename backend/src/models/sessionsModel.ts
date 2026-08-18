import type { PoolClient } from 'pg';

export async function insertSession(client: PoolClient, userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
  await client.query(
    `INSERT INTO user_sessions (tenant_id, user_id, token_hash, expires_at)
     VALUES (app_tenant_id(), $1, $2, $3)`, [userId, tokenHash, expiresAt],
  );
}

export async function findSessionUserId(client: PoolClient, tokenHash: string): Promise<string | null> {
  const result = await client.query<{ user_id: string }>(
    `SELECT user_id FROM user_sessions
     WHERE tenant_id = app_tenant_id() AND token_hash = $1 AND expires_at > now() AND revoked_at IS NULL`, [tokenHash],
  );
  return result.rows[0]?.user_id ?? null;
}

export async function revokeSession(client: PoolClient, tokenHash: string): Promise<void> {
  await client.query(
    `UPDATE user_sessions SET revoked_at = now()
     WHERE tenant_id = app_tenant_id() AND token_hash = $1 AND revoked_at IS NULL`, [tokenHash],
  );
}
