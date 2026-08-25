import { Suspense } from 'react';
import { z } from 'zod';
import CatalogApp from '@/components/CatalogApp';
import { backendJson } from '@/lib/backend';
import { CatalogSectionsResultSchema } from '@/domain/catalog/types';
import { CONFIG } from '@/lib/config';

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

// Server Component: a primeira carga (vitrines + grade paginada) já vem
// pronta no HTML inicial via /api/catalog-sections, filtrada pelos
// parâmetros de URL (categoria/subcategoria/público) — nada de montar a
// página sem filtro e corrigir no cliente depois (mesmo bug que já
// resolvemos pra highlights: o backend entrega pronto, o front não refaz).
// Suspense é obrigatório porque CatalogApp usa useSearchParams (só mais
// pra saber qual vitrine rolar até, `destaque` não filtra mais nada).
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string; subcategoria?: string; publico?: string }>;
}) {
  const { categoria, subcategoria, publico } = await searchParams;
  const audience = publico ? CONFIG.home?.audiences?.find((a) => a.id === publico) : undefined;
  const restrictIds = audience?.productIds ?? undefined;

  const sectionsQuery = new URLSearchParams();
  if (categoria) sectionsQuery.set('category', categoria);
  if (subcategoria) sectionsQuery.set('subcategory', subcategoria);
  if (restrictIds) sectionsQuery.set('restrictIds', restrictIds.join(','));

  const [filterOptions, initialSections] = await Promise.all([
    backendJson('/api/catalog-filters', CatalogFilterOptionsSchema),
    backendJson(`/api/catalog-sections?${sectionsQuery.toString()}`, CatalogSectionsResultSchema),
  ]);

  return (
    <Suspense>
      <CatalogApp
        filterOptions={filterOptions}
        initialSections={initialSections}
        initialFilters={{ category: categoria || '', subcategory: subcategoria || '' }}
        restrictIds={restrictIds}
      />
    </Suspense>
  );
}
