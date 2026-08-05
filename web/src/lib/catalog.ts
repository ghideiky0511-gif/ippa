import rawCatalog from '@/data/catalog.json';
import type { Product } from './types';

export const catalog = rawCatalog as unknown as Product[];
