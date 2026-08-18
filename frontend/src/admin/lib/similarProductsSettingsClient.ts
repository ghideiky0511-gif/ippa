import type { SimilarProductsSettings } from '@/domain/catalog/types';
import { adminJson } from './http';

export function fetchSimilarProductsSettings(): Promise<SimilarProductsSettings> {
  return adminJson('/api/similar-products-settings', {}, 'Não foi possível carregar a configuração de produtos similares.');
}

export function saveSimilarProductsSettings(settings: SimilarProductsSettings): Promise<SimilarProductsSettings> {
  return adminJson('/api/similar-products-settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  }, 'Não foi possível salvar — confira os dados e tente de novo.');
}
