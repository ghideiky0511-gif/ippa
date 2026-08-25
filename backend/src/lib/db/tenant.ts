import type { PoolClient } from 'pg';
import { getPool } from './pool';

export type { Tenant } from '@/contracts/tenant';
import type { Tenant } from '@/contracts/tenant';

export interface ActorContext {
  userId?: string;
  role?: string;
}

export async function findActiveTenant(slug: string): Promise<Tenant | null> {
  const normalized = slug.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(normalized)) return null;
  const result = await getPool().query<Tenant>(
    "SELECT id, slug, name FROM tenants WHERE slug = $1 AND active = true AND status = 'active'",
    [normalized],
  );
  return result.rows[0] ?? null;
}

/** Contexto é local à transação para nunca vazar em conexões reutilizadas pelo pool. */
export async function withTenantTransaction<T>(
  tenant: Tenant,
  actor: ActorContext,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenant.id]);
    await client.query("SELECT set_config('app.user_id', $1, true)", [actor.userId ?? '']);
    await client.query("SELECT set_config('app.role', $1, true)", [actor.role ?? '']);
    const value = await operation(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
