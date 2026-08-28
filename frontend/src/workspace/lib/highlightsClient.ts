import { z } from 'zod';
import { HighlightSchema, type Highlight } from '@/domain/catalog/types';
import { adminJson } from './http';
import { revalidateCatalogCache } from './cacheRevalidation';

export async function saveHighlights(highlights: Highlight[]): Promise<Highlight[]> {
  const saved = await adminJson('/api/highlights', z.array(HighlightSchema), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(highlights),
  }, 'Não foi possível salvar — confira os dados e tente de novo.');
  // Vitrines de coleção aparecem em /catalogo (/api/highlights e
  // /api/catalog-sections, tag `catalog:{slug}`).
  await revalidateCatalogCache();
  return saved;
}
