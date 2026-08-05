import { readFile } from 'node:fs/promises';
import path from 'node:path';
import HomeApp from '@/components/HomeApp';
import { catalog } from '@/lib/catalog';
import { resolveHomeSections } from '@/lib/catalogFacets';

// Força renderização em tempo de request: home-sections.json é editado pela
// plataforma admin (fora deste app) e precisa refletir aqui sem rebuild.
export const dynamic = 'force-dynamic';

// Server Component: home de vitrine (banners, produtos). O menu de
// categorias vive no menu lateral global (AppShell/SideMenu); a grade
// completa com filtros vive em /catalogo.
export default async function Page() {
  const raw = await readFile(path.join(process.cwd(), 'src/data/homeSections.json'), 'utf-8');
  const sections = resolveHomeSections(catalog, JSON.parse(raw));
  return <HomeApp sections={sections} />;
}
