import type { ProductOverrides } from '@/domain/catalog/types';
import { adminJson } from './http';

export function saveProductOverrides(overrides: ProductOverrides): Promise<ProductOverrides> {
  return adminJson('/api/product-overrides', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(overrides),
  }, 'Não foi possível salvar — confira os dados e tente de novo.');
}
