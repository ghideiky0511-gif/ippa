import { z } from 'zod';
import { ProductAdminSchema, ProductSchema, type Product, type ProductAdmin } from '@/domain/products/types';
import { adminJsonServer } from './httpServer';

export function fetchCatalog(): Promise<Product[]> {
  return adminJsonServer('/api/catalog', z.array(ProductSchema), {}, 'Não foi possível carregar os produtos do catálogo.');
}

export function fetchAdminProducts(): Promise<ProductAdmin[]> {
  return adminJsonServer('/api/admin/products', z.array(ProductAdminSchema), {}, 'Não foi possível carregar os produtos.');
}

export function fetchAdminProduct(id: string): Promise<ProductAdmin> {
  return adminJsonServer(`/api/admin/products/${encodeURIComponent(id)}`, ProductAdminSchema, {}, 'Não foi possível carregar o produto.');
}
