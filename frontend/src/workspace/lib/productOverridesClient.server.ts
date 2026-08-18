import type { ProductOverrides } from '@/domain/catalog/types';
import { adminJsonServer } from './httpServer';

export function fetchProductOverrides(): Promise<ProductOverrides> {
  return adminJsonServer('/api/product-overrides', {}, 'Não foi possível carregar os ajustes de produto.');
}
