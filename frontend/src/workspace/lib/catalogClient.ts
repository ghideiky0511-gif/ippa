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

export function createProduct(product: CreateProductInput): Promise<CreateProductResult> {
  const payload = CreateProductInputSchema.parse(product);
  return adminJson('/api/admin/products', CreateProductResultSchema, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, 'Não foi possível cadastrar o produto.');
}

export function updateManualProduct(id: string, product: UpdateManualProductInput): Promise<ProductAdmin> {
  const payload = UpdateManualProductInputSchema.parse(product);
  return adminJson(`/api/admin/products/${encodeURIComponent(id)}`, ProductAdminSchema, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, 'Não foi possível salvar o produto.');
}

export function refreshProductFromErp(id: string): Promise<RefreshProductFromErpResult> {
  return adminJson(`/api/admin/products/${encodeURIComponent(id)}/refresh-erp`, RefreshProductFromErpResultSchema, {
    method: 'POST',
  }, 'Não foi possível atualizar o produto a partir do ERP.');
}
