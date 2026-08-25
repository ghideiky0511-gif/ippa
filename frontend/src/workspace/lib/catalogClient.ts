import {
  CreateProductInputSchema,
  CreateProductResultSchema,
  type CreateProductInput,
  type CreateProductResult,
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
