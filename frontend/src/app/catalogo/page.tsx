import { Suspense } from 'react';
import { z } from 'zod';
import CatalogApp from '@/components/CatalogApp';
import { backendJson } from '@/lib/backend';
import { HighlightSchema, type Highlight } from '@/domain/catalog/types';
import { ProductSchema, type Product } from '@/domain/products/types';

interface CatalogFilterOptions {
  categories: string[];
  colors: string[];
  sizes: string[];
}

const CatalogFilterOptionsSchema = z.object({
  categories: z.array(z.string()),
  colors: z.array(z.string()),
  sizes: z.array(z.string()),
});

// productOverrides.json é editado pela plataforma admin e precisa
// refletir aqui sem rebuild — mesmo motivo de web/src/app/page.tsx.
export const dynamic = 'force-dynamic';

// Server Component: os dados já vêm prontos no HTML inicial, sem
// depender de fetch no cliente (o que resolvia o bug do file://).
// Suspense é obrigatório aqui porque CatalogApp usa useSearchParams
// (pré-seleciona a categoria vinda do menu da home).
export default async function Page() {
  const [catalog, filterOptions, highlights] = await Promise.all([
    backendJson('/api/catalog', z.array(ProductSchema)),
    backendJson('/api/catalog-filters', CatalogFilterOptionsSchema),
    backendJson('/api/highlights', z.array(HighlightSchema)),
  ]);
  return (
    <Suspense>
      <CatalogApp initialProducts={catalog} filterOptions={filterOptions} initialHighlights={highlights} />
    </Suspense>
  );
}
