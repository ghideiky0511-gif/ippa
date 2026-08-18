import type { Discount } from '@/domain/catalog/types';
import { adminJson } from './http';

export function saveDiscounts(discounts: Discount[]): Promise<Discount[]> {
  return adminJson('/api/discounts', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(discounts),
  }, 'Não foi possível salvar — confira os dados e tente de novo.');
}
