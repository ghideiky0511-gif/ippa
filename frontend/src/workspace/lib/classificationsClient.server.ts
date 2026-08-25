import { z } from 'zod';
import { ClassificationEntrySchema, type ClassificationEntry } from '@/domain/catalog/types';
import { adminJsonServer } from './httpServer';

export function fetchClassifications(): Promise<ClassificationEntry[]> {
  return adminJsonServer('/api/admin/classifications', z.array(ClassificationEntrySchema), {}, 'Não foi possível carregar as categorias.');
}
