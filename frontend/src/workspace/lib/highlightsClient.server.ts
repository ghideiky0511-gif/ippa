import type { Highlight } from '@/domain/catalog/types';
import { adminJsonServer } from './httpServer';

export function fetchHighlights(): Promise<Highlight[]> {
  return adminJsonServer('/api/highlights', {}, 'Não foi possível carregar as coleções.');
}
