import type { ClassificationEntry } from '@/domain/catalog/types';
import { adminJsonServer } from './httpServer';

export function fetchClassifications(): Promise<ClassificationEntry[]> {
  return adminJsonServer('/api/admin/classifications', {}, 'Não foi possível carregar as categorias.');
}
