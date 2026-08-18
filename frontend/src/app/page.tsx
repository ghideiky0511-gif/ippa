import HomeApp from '@/components/HomeApp';
import { resolveHomeSections } from '@/lib/catalogFacets';
import { backendJson } from '@/lib/backend';
import type { HomeSection } from '@/domain/catalog/types';
import type { Product } from '@/domain/products/types';

// Força renderização em tempo de request: home-sections.json é editado pela
// plataforma admin (fora deste app) e precisa refletir aqui sem rebuild.
export const dynamic = 'force-dynamic';

// Server Component: home de vitrine (banners, produtos). O menu de
// categorias vive no menu lateral global (AppShell/SideMenu); a grade
// completa com filtros vive em /catalogo.
export default async function Page() {
  const [catalog, rawSections] = await Promise.all([
    backendJson<Product[]>('/api/catalog'),
    backendJson<HomeSection[]>('/api/home-sections'),
  ]);
  const sections = resolveHomeSections(catalog, rawSections);
  return <HomeApp sections={sections} />;
}
