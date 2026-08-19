import type { Product } from '@/domain/products/types';
import { adminJsonServer } from './httpServer';

export function fetchCatalog(): Promise<Product[]> {
  return adminJsonServer('/api/catalog', {}, 'Não foi possível carregar os produtos do catálogo.');
}
