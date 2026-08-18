import { adminJson } from './http';

export function saveCatalogOrder(order: string[]): Promise<string[]> {
  return adminJson('/api/catalog-order', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(order),
  }, 'Não foi possível salvar — confira os dados e tente de novo.');
}
