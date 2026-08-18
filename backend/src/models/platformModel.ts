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
  userCount: number;
  contract: PlatformTenantContract | null;
}

export type PlatformPlanCode = 'trial' | 'essential' | 'professional' | 'enterprise';
export type TenantContractStatus = 'draft' | 'trialing' | 'active' | 'past_due' | 'suspended' | 'cancelled' | 'expired';
export type TenantContractBillingCycle = 'monthly' | 'annual' | 'custom';

export interface PlatformTenantContract {
  id: string;
  plan: { code: PlatformPlanCode; name: string };
  status: TenantContractStatus;
  billingCycle: TenantContractBillingCycle;
  currency: string;
  priceCents: number | null;
  startsAt: string | null;
  endsAt: string | null;
  externalReference: string | null;
}

export interface PlatformTenantUser {
  id: string;
  name: string;
  email: string;
  role: 'administrador' | 'vendedora' | 'expedicao' | 'entregador' | 'cliente';
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
  const tenants = result.rows.map((row) => ({ ...row, createdAt: row.created_at.toISOString(), userCount: 0, contract: null }));
  if (tenants.length === 0) return tenants;
  const tenantIds = tenants.map((tenant) => tenant.id);
  const [counts, contracts] = await Promise.all([
    client.query<{ tenant_id: string; user_count: string }>(
      'SELECT tenant_id, count(*)::text AS user_count FROM users WHERE tenant_id = ANY($1::uuid[]) GROUP BY tenant_id', [tenantIds],
    ),
    client.query<{ tenant_id: string; id: string; code: PlatformPlanCode; name: string; status: TenantContractStatus; billing_cycle: TenantContractBillingCycle; currency: string; price_cents: number | null; starts_at: Date | null; ends_at: Date | null; external_reference: string | null }>(
      `SELECT DISTINCT ON (c.tenant_id) c.tenant_id, c.id, p.code, p.name, c.status, c.billing_cycle, c.currency, c.price_cents, c.starts_at, c.ends_at, c.external_reference
       FROM tenant_contracts c JOIN platform_plans p ON p.id = c.plan_id
       WHERE c.tenant_id = ANY($1::uuid[]) ORDER BY c.tenant_id, c.created_at DESC`, [tenantIds],
    ),
  ]);
  const countByTenant = new Map(counts.rows.map((row) => [row.tenant_id, Number(row.user_count)]));
  const contractByTenant = new Map<string, PlatformTenantContract>(contracts.rows.map((row) => [row.tenant_id, {
    id: row.id, plan: { code: row.code, name: row.name }, status: row.status, billingCycle: row.billing_cycle, currency: row.currency,
    priceCents: row.price_cents, startsAt: row.starts_at?.toISOString() ?? null, endsAt: row.ends_at?.toISOString() ?? null, externalReference: row.external_reference,
  }]));
  return tenants.map((tenant) => ({ ...tenant, userCount: countByTenant.get(tenant.id) ?? 0, contract: contractByTenant.get(tenant.id) ?? null }));
}

export async function listPlatformTenantUsers(client: PoolClient, tenantId: string): Promise<PlatformTenantUser[]> {
  const result = await client.query<{ id: string; name: string; email: string; role: PlatformTenantUser['role']; created_at: Date }>(
    'SELECT id, name, email, role, created_at FROM users WHERE tenant_id = $1 ORDER BY created_at DESC', [tenantId],
  );
  // A tabela tenant users ainda não suporta inativação individual; todo registro existente é ativo.
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    active: true,
    createdAt: row.created_at.toISOString(),
  }));
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
  return row ? { ...row, createdAt: row.created_at.toISOString(), userCount: 0, contract: null } : null;
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
