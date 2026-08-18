import type { Highlight } from '@/domain/catalog/types';
import { adminJson } from './http';

export function saveHighlights(highlights: Highlight[]): Promise<Highlight[]> {
  return adminJson('/api/highlights', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(highlights),
  }, 'Não foi possível salvar — confira os dados e tente de novo.');
}
