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
