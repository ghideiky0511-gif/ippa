'use server';

import { headers } from 'next/headers';
import { updateTag } from 'next/cache';
import { cacheTag } from '@/lib/cacheTags';

async function currentTenantSlug(): Promise<string | null> {
  const incomingHeaders = await headers();
  return incomingHeaders.get('x-ippa-tenant');
}

// `updateTag` (não `revalidateTag`) porque só é chamado a partir de Server
// Actions logo após a própria escrita (read-your-own-writes): expira a
// entrada na hora, sem esperar o próximo visitante pra disparar o refetch.
export async function revalidateStoreSettingsCache(): Promise<void> {
  const tenantSlug = await currentTenantSlug();
  if (tenantSlug) updateTag(cacheTag('storeSettings', tenantSlug));
}

export async function revalidateClassificationsCache(): Promise<void> {
  const tenantSlug = await currentTenantSlug();
  if (tenantSlug) updateTag(cacheTag('classifications', tenantSlug));
}

// Tag `catalog:{slug}` — leituras públicas de produto/vitrine/home: a home
// (`/`, /api/catalog + /api/home-sections), /catalogo (/api/catalog-sections
// + /api/highlights) e /produto/[id] (/api/catalog). Sem isso, salvar no
// Editor da home, em Coleções, Descontos, Produtos ou nos overrides levaria
// até `revalidate: 20` pra aparecer no catálogo público.
export async function revalidateCatalogCache(): Promise<void> {
  const tenantSlug = await currentTenantSlug();
  if (tenantSlug) updateTag(cacheTag('catalog', tenantSlug));
}
