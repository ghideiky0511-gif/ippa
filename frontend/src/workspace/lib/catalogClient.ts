import {
  CreateProductInputSchema,
  CreateProductResultSchema,
  ProductAdminSchema,
  RefreshProductFromErpResultSchema,
  UpdateManualProductInputSchema,
  type CreateProductInput,
  type CreateProductResult,
  type ProductAdmin,
  type RefreshProductFromErpResult,
  type UpdateManualProductInput,
} from '@/domain/products/types';
import { adminJson } from './http';
import { revalidateCatalogCache } from './cacheRevalidation';

export async function createProduct(product: CreateProductInput): Promise<CreateProductResult> {
  const payload = CreateProductInputSchema.parse(product);
  const result = await adminJson('/api/admin/products', CreateProductResultSchema, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, 'Não foi possível cadastrar o produto.');
  // Produto novo/editado aparece na grade e nas vitrines do catálogo
  // público (tag `catalog:{slug}`) sem esperar `revalidate: 20`.
  await revalidateCatalogCache();
  return result;
}

export async function updateManualProduct(id: string, product: UpdateManualProductInput): Promise<ProductAdmin> {
  const payload = UpdateManualProductInputSchema.parse(product);
  const updated = await adminJson(`/api/admin/products/${encodeURIComponent(id)}`, ProductAdminSchema, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, 'Não foi possível salvar o produto.');
  await revalidateCatalogCache();
  return updated;
}

export async function refreshProductFromErp(id: string): Promise<RefreshProductFromErpResult> {
  const result = await adminJson(`/api/admin/products/${encodeURIComponent(id)}/refresh-erp`, RefreshProductFromErpResultSchema, {
    method: 'POST',
  }, 'Não foi possível atualizar o produto a partir do ERP.');
  await revalidateCatalogCache();
  return result;
}
