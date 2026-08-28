import { z } from 'zod';
import { DiscountSchema, type Discount } from '@/domain/catalog/types';
import { adminJson } from './http';
import { revalidateCatalogCache } from './cacheRevalidation';

export async function saveDiscounts(discounts: Discount[]): Promise<Discount[]> {
  const saved = await adminJson('/api/discounts', z.array(DiscountSchema), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(discounts),
  }, 'Não foi possível salvar — confira os dados e tente de novo.');
  // Descontos ativos entram no preço exibido nos cards do catálogo público
  // (tag `catalog:{slug}`).
  await revalidateCatalogCache();
  return saved;
}
