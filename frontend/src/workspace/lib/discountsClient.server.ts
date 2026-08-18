import type { Discount } from '@/domain/catalog/types';
import { adminJsonServer } from './httpServer';

export function fetchDiscounts(): Promise<Discount[]> {
  return adminJsonServer('/api/discounts', {}, 'Não foi possível carregar os descontos.');
}
