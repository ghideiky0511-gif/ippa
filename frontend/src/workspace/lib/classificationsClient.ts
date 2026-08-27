import { ClassificationEntrySchema, type ClassificationEntry } from '@/domain/catalog/types';
import { adminJson } from './http';
import { revalidateClassificationsCache } from './cacheRevalidation';

export async function setClassificationActive(id: string, active: boolean): Promise<ClassificationEntry> {
  const updated = await adminJson(`/api/admin/classifications/${id}`, ClassificationEntrySchema, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active }),
  }, 'Não foi possível salvar — tente de novo.');
  // Sem isso, /api/categories e /api/catalog-filters (cacheados com
  // `revalidate: 30`) levariam até 30s pra refletir a categoria ativada ou
  // desativada aqui em /ferramentas.
  await revalidateClassificationsCache();
  return updated;
}

export function fetchClassifications(): Promise<ClassificationEntry[]> {
  return adminJson('/api/admin/classifications', ClassificationEntrySchema.array(), {}, 'Não foi possível carregar as classificações.');
}
