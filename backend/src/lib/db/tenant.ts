import type { PoolClient } from 'pg';
import { errorMeta, logger } from '@/lib/logger';
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
// que limpa este processo e avisa as outras Machines pelo adapter Redis (ver
// setTenantCachePeerNotifier abaixo). O TTL continua sendo a rede de
// segurança: com o Redis fora do ar o aviso não chega, e as outras Machines
// convergem em no máximo 60s.
const TENANT_CACHE_TTL_MS = 60_000;
// Slug inexistente também entra no cache: sem isso, bater em slugs inválidos
// (mas bem formados) continuaria sendo uma query por request. O teto abaixo
// existe porque esse é justamente o caso em que a chave é escolhida por quem
// chama -- estourou, descarta tudo; é cache, o custo é uma query a mais.
const TENANT_CACHE_MAX_ENTRIES = 500;

// globalThis pelo mesmo motivo de services/realtime/sessionBroadcast.ts: o
// server.ts (carregado pelo tsx) e as rotas do Next (bundle próprio) carregam
// CÓPIAS separadas deste módulo. Sem isso havia dois caches no mesmo processo
// — o forgetTenant chamado por uma rota do Next nunca limpava o que o
// handshake do socket consulta (ticketService.ts), e o aviso vindo de outra
// Machine (registrado pelo server.ts) nunca limparia o das rotas.
const globalForTenantCache = globalThis as unknown as {
  __tenantCache?: Map<string, { tenant: Tenant | null; expiresAt: number }>;
  __tenantCachePeerNotifier?: (slug: string) => void;
};
const tenantCache = globalForTenantCache.__tenantCache
  ?? (globalForTenantCache.__tenantCache = new Map());

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

/** Registrado pelo server.ts só quando o adapter Redis está ligado: é como
 * forgetTenant avisa as outras Machines. Sem adapter (um processo só) não há
 * ninguém pra avisar. */
export function setTenantCachePeerNotifier(notify: ((slug: string) => void) | undefined): void {
  globalForTenantCache.__tenantCachePeerNotifier = notify;
}

export function forgetTenant(slug: string): void {
  const normalized = normalizeSlug(slug);
  tenantCache.delete(normalized);
  try {
    globalForTenantCache.__tenantCachePeerNotifier?.(normalized);
  } catch (error) {
    // Quem chama já concluiu a mudança de status (depois do commit); uma
    // falha em avisar as outras Machines não pode virar erro pra ele — o TTL
    // cobre.
    logger.error('tenant-cache', 'Falha ao avisar as outras Machines.', errorMeta(error));
  }
}

/** Lado de quem RECEBE o aviso de outra Machine: limpa só aqui, sem reemitir —
 * reemitir faria o aviso ficar quicando entre as Machines. */
export function forgetTenantLocally(slug: string): void {
  tenantCache.delete(normalizeSlug(slug));
}

export async function findActiveTenant(slug: string): Promise<Tenant | null> {
  const normalized = normalizeSlug(slug);
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
