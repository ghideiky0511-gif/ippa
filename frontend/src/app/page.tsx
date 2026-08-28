import { headers } from 'next/headers';
import { z } from 'zod';
import HomeApp from '@/components/HomeApp';
import { resolveHomeSections } from '@/lib/catalogFacets';
import { backendJson } from '@/lib/backend';
import { cacheTag } from '@/lib/cacheTags';
import { CatalogPageSchema, HomeSectionSchema } from '@/domain/catalog/types';

// Força renderização em tempo de request: os blocos da home são editados no
// workspace (Editor da home) e precisam refletir aqui sem rebuild. As duas
// leituras abaixo ficam no Data Cache sob a tag `catalog:{slug}`, que o
// workspace expira na hora ao salvar (ver workspace/lib/cacheRevalidation.ts).
export const dynamic = 'force-dynamic';

// Server Component. Para a raiz institucional (sem tenant no path, header
// `x-ippa-institutional`) mostra só o aviso; para `/{slug}` monta a home de
// vitrine (banners + produtos posicionados no canvas do builder). O menu de
// categorias vive no shell global; a grade com filtros vive em /catalogo.
export default async function Page() {
  const incomingHeaders = await headers();
  const tenantSlug = incomingHeaders.get('x-ippa-tenant');

  if (incomingHeaders.get('x-ippa-institutional') === '1' || !tenantSlug) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#18181b] px-6 text-white">
        <section className="max-w-xl text-center">
          <p className="mb-6 text-sm font-semibold tracking-[0.28em] text-zinc-400">IPPA</p>
          <h1 className="font-editorial text-5xl leading-none sm:text-6xl">Uma nova experiência está a caminho.</h1>
          <p className="mt-6 text-base leading-7 text-zinc-300">
            Estamos preparando o novo site institucional da IPPA.
          </p>
        </section>
      </main>
    );
  }

  const tags = [cacheTag('catalog', tenantSlug)];
  const rawSections = await backendJson('/api/home-sections', z.array(HomeSectionSchema), {
    next: { revalidate: 20, tags },
  });
  const productIds = [...new Set(
    rawSections
      .filter((section) => section.type === 'product')
      .map((section) => section.productId),
  )];
  const catalog = productIds.length > 0
    ? (await backendJson(
        `/api/catalog?ids=${productIds.map(encodeURIComponent).join(',')}`,
        CatalogPageSchema,
        { next: { revalidate: 20, tags } },
      )).items
    : [];

  return <HomeApp sections={resolveHomeSections(catalog, rawSections)} />;
}
