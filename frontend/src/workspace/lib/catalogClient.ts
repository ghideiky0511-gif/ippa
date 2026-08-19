import { adminJson } from './http';

export interface CreateProductInput {
  name: string;
  price: number;
  category?: string;
  referenceId?: string;
  description?: string;
  image?: string;
  variant?: { color: string; size: string };
}

export function createProduct(product: CreateProductInput): Promise<{ id: string }> {
  return adminJson('/api/admin/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(product),
  }, 'Não foi possível cadastrar o produto.');
}
