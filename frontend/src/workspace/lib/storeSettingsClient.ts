import { StoreSettingsSchema, type StoreSettings } from '@/domain/catalog/types';
import { adminJson } from './http';
import { revalidateStoreSettingsCache } from './cacheRevalidation';

export async function saveStoreSettings(settings: StoreSettings): Promise<StoreSettings> {
  const updated = await adminJson('/api/store-settings', StoreSettingsSchema, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  }, 'Não foi possível salvar — confira os dados e tente de novo.');
  // Sem isso, o catálogo público (cacheado com `revalidate: 30`) levaria até
  // 30s pra refletir a mudança feita aqui em /ferramentas.
  await revalidateStoreSettingsCache();
  return updated;
}
