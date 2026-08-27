// Tags de Data Cache do Next para dados de tenant lidos com pouca frequência
// de mudança (tenant, categorias, config da loja). Usado tanto na leitura
// (backendJson com `next: { tags: [...] }`) quanto na invalidação
// (revalidateTag em workspace/lib/cacheRevalidation.ts) — mantidos aqui pra
// as duas pontas nunca divergirem.
const CACHE_SCOPES = {
  tenant: 'tenant',
  classifications: 'classifications',
  storeSettings: 'store-settings',
  catalog: 'catalog',
} as const;

export type CacheScope = keyof typeof CACHE_SCOPES;

export function cacheTag(scope: CacheScope, tenantSlug: string): string {
  return `${CACHE_SCOPES[scope]}:${tenantSlug}`;
}
