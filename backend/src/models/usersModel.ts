import type { PoolClient } from 'pg';
import type { AuthUser, UserRole } from '@/lib/types';

export interface StoredUser extends AuthUser {
  passwordHash: string;
}

type UserRow = {
  id: string; email: string; name: string; role: UserRole; client_id: string | null; permissions: AuthUser['permissions']; password_hash: string;
};

function toStoredUser(row: UserRow): StoredUser {
  return { id: row.id, email: row.email, name: row.name, role: row.role, clientId: row.client_id ?? undefined, permissions: row.permissions, passwordHash: row.password_hash };
}

export async function findUserByEmail(client: PoolClient, email: string): Promise<StoredUser | null> {
  const result = await client.query<UserRow>(
    `SELECT id, email, name, role, client_id, permissions, password_hash
     FROM users WHERE tenant_id = app_tenant_id() AND email = $1`,
    [email.trim().toLowerCase()],
  );
  return result.rows[0] ? toStoredUser(result.rows[0]) : null;
}

export async function findUserById(client: PoolClient, id: string): Promise<StoredUser | null> {
  const result = await client.query<UserRow>(
    `SELECT id, email, name, role, client_id, permissions, password_hash
     FROM users WHERE tenant_id = app_tenant_id() AND id = $1`, [id],
  );
  return result.rows[0] ? toStoredUser(result.rows[0]) : null;
}

export async function insertUser(client: PoolClient, params: {
  email: string; name: string; role: UserRole; passwordHash: string; clientId?: string; permissions: AuthUser['permissions'];
}): Promise<AuthUser> {
  const result = await client.query<UserRow>(
    `INSERT INTO users (tenant_id, email, name, role, password_hash, client_id, permissions)
     VALUES (app_tenant_id(), $1, $2, $3, $4, $5, $6)
     RETURNING id, email, name, role, client_id, permissions, password_hash`,
    [params.email.trim().toLowerCase(), params.name.trim(), params.role, params.passwordHash, params.clientId ?? null, JSON.stringify(params.permissions ?? {})],
  );
  const { passwordHash: _passwordHash, ...user } = toStoredUser(result.rows[0]);
  return user;
}

export async function listUsers(client: PoolClient): Promise<AuthUser[]> {
  const result = await client.query<UserRow>(
    `SELECT id, email, name, role, client_id, permissions, password_hash
     FROM users WHERE tenant_id = app_tenant_id() ORDER BY name, email`,
  );
  return result.rows.map((row) => {
    const { passwordHash: _passwordHash, ...user } = toStoredUser(row);
    return user;
  });
}
