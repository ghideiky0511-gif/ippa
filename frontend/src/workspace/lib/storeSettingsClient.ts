import { StoreSettingsSchema, type StoreSettings } from '@/domain/catalog/types';
import { adminJson } from './http';

export function saveStoreSettings(settings: StoreSettings): Promise<StoreSettings> {
  return adminJson('/api/store-settings', StoreSettingsSchema, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  }, 'Não foi possível salvar — confira os dados e tente de novo.');
}
