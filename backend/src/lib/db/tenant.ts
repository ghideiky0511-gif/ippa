import type { PoolClient } from 'pg';
import { getPool } from './pool';

export type { Tenant } from '@/contracts/tenant';
import type { Tenant } from '@/contracts/tenant';

export interface ActorContext {
  userId?: string;
  role?: string;
}

// resolveTenantRoute chama findActiveTenant em TODA requisição de rota de
// tenant, mas slug -> tenant só muda quando um tenant é criado ou desativado --
// raríssimo. Sem cache isso era uma ida ao Postgres por request, e numa rajada
// de requisições (ver o resync coalescido em useUpdatesRealtime.ts) essa query
// sozinha chegou a esgotar o pool: os handlers ficavam presos esperando
// conexão e o erro que subia era "timeout exceeded when trying to connect"
// aqui, mascarando que o gargalo era volume, não uma query lenta.
//
// TTL curto porque desativar um tenant precisa ter efeito rápido: o caminho de
// desativação chama forgetTenant (ver changeTenantStatus em tenantService.ts),
// mas isso só limpa o cache DESTA instância -- com mais de uma Machine no ar, o
// TTL é o que garante que as outras convirjam.
const TENANT_CACHE_TTL_MS = 60_000;
// Slug inexistente também entra no cache: sem isso, bater em slugs inválidos
// (mas bem formados) continuaria sendo uma query por request. O teto abaixo
// existe porque esse é justamente o caso em que a chave é escolhida por quem
// chama -- estourou, descarta tudo; é cache, o custo é uma query a mais.
const TENANT_CACHE_MAX_ENTRIES = 500;
const tenantCache = new Map<string, { tenant: Tenant | null; expiresAt: number }>();

export function forgetTenant(slug: string): void {
  tenantCache.delete(slug.trim().toLowerCase());
}

export async function findActiveTenant(slug: string): Promise<Tenant | null> {
  const normalized = slug.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(normalized)) return null;
  const cached = tenantCache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) return cached.tenant;
  const result = await getPool().query<Tenant>(
    "SELECT id, slug, name FROM tenants WHERE slug = $1 AND active = true AND status = 'active'",
    [normalized],
  );
  const tenant = result.rows[0] ?? null;
  if (tenantCache.size >= TENANT_CACHE_MAX_ENTRIES) tenantCache.clear();
  tenantCache.set(normalized, { tenant, expiresAt: Date.now() + TENANT_CACHE_TTL_MS });
  return tenant;
}

export async function findActiveTenantById(id: string): Promise<Tenant | null> {
  const result = await getPool().query<Tenant>(
    "SELECT id, slug, name FROM tenants WHERE id = $1 AND active = true AND status = 'active'",
    [id],
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
