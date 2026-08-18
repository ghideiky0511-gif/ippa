import type { PoolClient } from 'pg';

export interface ActiveSession {
  id: string;
  userId: string;
}

export async function insertSession(client: PoolClient, userId: string, tokenHash: string, expiresAt: Date): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO user_sessions (tenant_id, user_id, token_hash, expires_at)
     VALUES (app_tenant_id(), $1, $2, $3)
     RETURNING id`, [userId, tokenHash, expiresAt],
  );
  return result.rows[0].id;
}

export async function findActiveSession(client: PoolClient, tokenHash: string): Promise<ActiveSession | null> {
  const result = await client.query<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM user_sessions
     WHERE tenant_id = app_tenant_id() AND token_hash = $1 AND expires_at > now() AND revoked_at IS NULL`, [tokenHash],
  );
  const session = result.rows[0];
  return session ? { id: session.id, userId: session.user_id } : null;
}

export async function revokeSession(client: PoolClient, tokenHash: string): Promise<void> {
  await client.query(
    `UPDATE user_sessions SET revoked_at = now()
     WHERE tenant_id = app_tenant_id() AND token_hash = $1 AND revoked_at IS NULL`, [tokenHash],
  );
}
