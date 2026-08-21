import { z } from 'zod';
import { HighlightSchema, type Highlight } from '@/domain/catalog/types';
import { adminJsonServer } from './httpServer';

export function fetchHighlights(): Promise<Highlight[]> {
  return adminJsonServer('/api/highlights', z.array(HighlightSchema), {}, 'Não foi possível carregar as coleções.');
}
