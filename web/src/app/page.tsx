import HomeApp from '@/components/HomeApp';
import catalog from '@/data/catalog.json';
import { CONFIG } from '@/lib/config';
import { getFeaturedProducts } from '@/lib/catalogFacets';

// Server Component: home de vitrine (banners, destaques). O menu de
// categorias vive no menu lateral global (AppShell/SideMenu); a grade
// completa com filtros vive em /catalogo.
export default function Page() {
  const featuredProducts = getFeaturedProducts(catalog, CONFIG.home?.featuredProductIds);
  return <HomeApp featuredProducts={featuredProducts} />;
}
