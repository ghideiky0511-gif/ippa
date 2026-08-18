import type { Product } from '@/domain/products/types';
import { adminJson } from './http';

export function fetchCatalog(): Promise<Product[]> {
  return adminJson('/api/catalog', {}, 'Não foi possível carregar os produtos do catálogo.');
}
