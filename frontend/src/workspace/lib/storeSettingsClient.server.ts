import type { StoreSettings } from '@/domain/catalog/types';
import { adminJsonServer } from './httpServer';

export function fetchStoreSettings(): Promise<StoreSettings> {
  return adminJsonServer('/api/store-settings', {}, 'Não foi possível carregar as configurações da loja.');
}
