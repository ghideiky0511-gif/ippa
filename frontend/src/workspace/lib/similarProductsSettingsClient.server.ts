import { SimilarProductsSettingsSchema, type SimilarProductsSettings } from '@/domain/catalog/types';
import { adminJsonServer } from './httpServer';

export function fetchSimilarProductsSettings(): Promise<SimilarProductsSettings> {
  return adminJsonServer('/api/similar-products-settings', SimilarProductsSettingsSchema, {}, 'Não foi possível carregar a configuração de produtos similares.');
}
