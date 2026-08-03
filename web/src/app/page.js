import HomeApp from '@/components/HomeApp';
import catalog from '@/data/catalog.json';
import { CONFIG } from '@/lib/config';
import { getCategoryTree, getFeaturedProducts } from '@/lib/catalogFacets';

// Server Component: home de vitrine (banners, menu de categorias, destaques).
// A grade completa com filtros vive em /catalogo.
export default function Page() {
  const categoryTree = getCategoryTree(catalog);
  const featuredProducts = getFeaturedProducts(catalog, CONFIG.home?.featuredProductIds);
  return <HomeApp categoryTree={categoryTree} featuredProducts={featuredProducts} />;
}
