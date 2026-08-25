import { z } from 'zod';
import { DiscountSchema, type Discount } from '@/domain/catalog/types';
import { adminJsonServer } from './httpServer';

export function fetchDiscounts(): Promise<Discount[]> {
  return adminJsonServer('/api/discounts', z.array(DiscountSchema), {}, 'Não foi possível carregar os descontos.');
}
