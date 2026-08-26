import { Suspense } from 'react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { z } from 'zod';
import CatalogApp from '@/components/CatalogApp';
import { backendJson } from '@/lib/backend';
import { CatalogSectionsResultSchema, HighlightSchema } from '@/domain/catalog/types';
import { TenantProfileSchema } from '@/domain/tenant/types';
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

const CatalogShareSchema = z.object({ name: z.string().nullable() });

type CatalogSearchParams = {
  categoria?: string;
  subcategoria?: string;
  publico?: string;
  destaque?: string;
  precos?: string;
  sharedBy?: string;
};

function catalogScopeLabel(params: CatalogSearchParams, collectionLabel?: string): string {
  if (collectionLabel) return `Coleção ${collectionLabel}`;
  if (params.subcategoria) return `Catálogo ${params.subcategoria}`;
  if (params.categoria) return `Catálogo ${params.categoria}`;
  return 'Catálogo';
}

function publicCatalogUrl(tenantSlug: string, params: CatalogSearchParams, incomingHeaders: Headers): string | undefined {
  const host = incomingHeaders.get('x-forwarded-host') ?? incomingHeaders.get('host');
  if (!host) return undefined;
  const protocol = incomingHeaders.get('x-forwarded-proto') ?? 'https';
  const url = new URL(`/${tenantSlug}/catalogo`, `${protocol}://${host}`);
  // Mantém somente os parâmetros que definem a vitrine ou a autoria do
  // compartilhamento. `session`, por exemplo, é um link interno e não
  // deve virar uma URL canônica/indexável.
  for (const key of ['categoria', 'subcategoria', 'publico', 'destaque', 'precos', 'sharedBy'] as const) {
    const value = params[key];
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<CatalogSearchParams>;
}): Promise<Metadata> {
  const params = await searchParams;
  const audience = params.publico ? CONFIG.home?.audiences?.find((entry) => entry.id === params.publico) : undefined;
  const restrictIds = audience?.productIds ?? undefined;
  const sectionsQuery = new URLSearchParams();
  if (params.categoria) sectionsQuery.set('category', params.categoria);
  if (params.subcategoria) sectionsQuery.set('subcategory', params.subcategoria);
  if (restrictIds) sectionsQuery.set('restrictIds', restrictIds.join(','));

  const [tenant, catalog, highlights, share, incomingHeaders] = await Promise.all([
    backendJson('/api/tenant', TenantProfileSchema),
    backendJson(`/api/catalog-sections?${sectionsQuery.toString()}`, CatalogSectionsResultSchema),
    backendJson('/api/highlights', z.array(HighlightSchema)),
    params.sharedBy
      ? backendJson(`/api/catalog-share?sharedBy=${encodeURIComponent(params.sharedBy)}`, CatalogShareSchema)
      : Promise.resolve({ name: null }),
    headers(),
  ]);

  const collection = params.destaque ? highlights.find((highlight) => highlight.id === params.destaque) : undefined;
  // Nas coleções, a primeira peça da curadoria é a que representa o link;
  // em todo o resto, a primeira peça do recorte que a pessoa vai receber.
  const collectionFirstProduct = collection
    ? catalog.sections.find((section) => section.id === collection.id)?.items[0]
    : undefined;
  const firstProduct = collectionFirstProduct ?? catalog.all.items[0];
  const scope = catalogScopeLabel(params, collection?.label);
  const title = `${scope} — ${tenant.name}`;
  const details = firstProduct ? `Confira ${firstProduct.name} e outras peças.` : `Confira as peças disponíveis.`;
  const description = `${details} ${share.name ? `Enviado por ${share.name}. ` : ''}Catálogo de ${tenant.name}.`;
  const image = firstProduct?.image ?? firstProduct?.images?.[0];
  const url = publicCatalogUrl(tenant.slug, params, incomingHeaders);

  return {
    title,
    description,
    alternates: url ? { canonical: url } : undefined,
    openGraph: {
      type: 'website',
      url,
      siteName: tenant.name,
      title,
      description,
      images: image ? [{ url: image, alt: firstProduct?.name ?? `Catálogo ${tenant.name}` }] : undefined,
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

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
  searchParams: Promise<CatalogSearchParams>;
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
