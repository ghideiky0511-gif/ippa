import { SimilarProductsSettingsSchema, type SimilarProductsSettings } from '@/domain/catalog/types';
import { adminJson } from './http';

export function saveSimilarProductsSettings(settings: SimilarProductsSettings): Promise<SimilarProductsSettings> {
  return adminJson('/api/similar-products-settings', SimilarProductsSettingsSchema, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  }, 'Não foi possível salvar — confira os dados e tente de novo.');
}
