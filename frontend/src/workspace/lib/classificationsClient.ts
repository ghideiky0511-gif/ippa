import { ClassificationEntrySchema, type ClassificationEntry } from '@/domain/catalog/types';
import { adminJson } from './http';

export function setClassificationActive(id: string, active: boolean): Promise<ClassificationEntry> {
  return adminJson(`/api/admin/classifications/${id}`, ClassificationEntrySchema, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active }),
  }, 'Não foi possível salvar — tente de novo.');
}
