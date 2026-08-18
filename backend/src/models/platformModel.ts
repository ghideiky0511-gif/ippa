import type { PoolClient } from 'pg';

export type TenantStatus = 'active' | 'inactive' | 'archived';

export interface PlatformUserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  active: boolean;
}

export interface PlatformTenant {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  active: boolean;
  createdAt: string;
}

export async function findPlatformUserByEmail(client: PoolClient, email: string): Promise<PlatformUserRow | null> {
  const result = await client.query<PlatformUserRow>(
    `SELECT id, email, name, password_hash, active
     FROM platform_users
     WHERE email = $1 AND active = true`,
    [email.trim().toLowerCase()],
  );
  return result.rows[0] ?? null;
}

export async function findPlatformUserBySession(client: PoolClient, tokenHash: string): Promise<PlatformUserRow | null> {
  const result = await client.query<PlatformUserRow>(
    `SELECT u.id, u.email, u.name, u.password_hash, u.active
     FROM platform_sessions s
     JOIN platform_users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.active = true`,
    [tokenHash],
  );
  return result.rows[0] ?? null;
}

export async function insertPlatformSession(client: PoolClient, userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
  await client.query(
    'INSERT INTO platform_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, tokenHash, expiresAt],
  );
}

export async function revokePlatformSession(client: PoolClient, tokenHash: string): Promise<void> {
  await client.query('UPDATE platform_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [tokenHash]);
}

export async function listPlatformTenants(client: PoolClient): Promise<PlatformTenant[]> {
  const result = await client.query<{
    id: string; slug: string; name: string; status: TenantStatus; active: boolean; created_at: Date;
  }>(
    'SELECT id, slug, name, status, active, created_at FROM tenants ORDER BY created_at DESC',
  );
  return result.rows.map((row) => ({ ...row, createdAt: row.created_at.toISOString() }));
}

export async function insertTenant(client: PoolClient, slug: string, name: string): Promise<{ id: string; slug: string; name: string }> {
  const result = await client.query<{ id: string; slug: string; name: string }>(
    `INSERT INTO tenants (slug, name, active, status)
     VALUES ($1, $2, true, 'active')
     RETURNING id, slug, name`,
    [slug, name],
  );
  return result.rows[0];
}

export async function setTenantStatus(client: PoolClient, id: string, status: TenantStatus): Promise<PlatformTenant | null> {
  const active = status === 'active';
  const result = await client.query<{
    id: string; slug: string; name: string; status: TenantStatus; active: boolean; created_at: Date;
  }>(
    `UPDATE tenants
     SET status = $2, active = $3, updated_at = now()
     WHERE id = $1
     RETURNING id, slug, name, status, active, created_at`,
    [id, status, active],
  );
  const row = result.rows[0];
  return row ? { ...row, createdAt: row.created_at.toISOString() } : null;
}

export async function insertTenantAdministrator(client: PoolClient, tenantId: string, email: string, name: string, passwordHash: string): Promise<void> {
  await client.query(
    `INSERT INTO users (tenant_id, email, name, role, password_hash, permissions)
     VALUES ($1, $2, $3, 'administrador', $4, '{"adminAccess": true, "catalogAreas": []}'::jsonb)`,
    [tenantId, email, name, passwordHash],
  );
}

export async function insertTenantDefaults(client: PoolClient, tenantId: string): Promise<void> {
  await client.query('INSERT INTO store_settings (tenant_id) VALUES ($1)', [tenantId]);
  const location = await client.query<{ id: string }>(
    `INSERT INTO inventory_locations (tenant_id, code, name, kind, is_default)
     VALUES ($1, 'default', 'Depósito padrão', 'warehouse', true)
     RETURNING id`,
    [tenantId],
  );
  await client.query(
    'UPDATE store_settings SET default_inventory_location_id = $2 WHERE tenant_id = $1',
    [tenantId, location.rows[0].id],
  );
}
