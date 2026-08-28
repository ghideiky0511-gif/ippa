import { ProductOverridesSchema, type ProductOverrides } from '@/domain/catalog/types';
import { adminJson } from './http';
import { revalidateCatalogCache } from './cacheRevalidation';

export async function saveProductOverrides(overrides: ProductOverrides): Promise<ProductOverrides> {
  const saved = await adminJson('/api/product-overrides', ProductOverridesSchema, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(overrides),
  }, 'Não foi possível salvar — confira os dados e tente de novo.');
  // Overrides alteram campos do produto exibidos no catálogo público
  // (tag `catalog:{slug}`).
  await revalidateCatalogCache();
  return saved;
}
