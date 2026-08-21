import { z } from 'zod';
import { ProductSchema, type Product } from '@/domain/products/types';
import { adminJsonServer } from './httpServer';

export function fetchCatalog(): Promise<Product[]> {
  return adminJsonServer('/api/catalog', z.array(ProductSchema), {}, 'Não foi possível carregar os produtos do catálogo.');
}
