import type { StoreSettings } from '@/domain/catalog/types';
import { adminJson } from './http';

export function fetchStoreSettings(): Promise<StoreSettings> {
  return adminJson('/api/store-settings', {}, 'Não foi possível carregar as configurações da loja.');
}

export function saveStoreSettings(settings: StoreSettings): Promise<StoreSettings> {
  return adminJson('/api/store-settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  }, 'Não foi possível salvar — confira os dados e tente de novo.');
}
