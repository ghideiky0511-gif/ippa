'use client';
import { publicUi } from '@/lib/ui';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Filters from './Filters';
import ProductCard from './ProductCard';
import ProductCardSkeleton from './ProductCardSkeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { getCategories, getColors, getSizes } from '@/lib/catalogFacets';
import { CONFIG } from '@/lib/config';
import type { Highlight } from '@/domain/catalog/types';
import type { Product } from '@/domain/products/types';

export interface CatalogFilters {
  term: string;
  category: string;
  subcategory: string;
  color: string;
  size: string;
  destaque: string;
  publico: string;
}

export default function CatalogApp({ initialProducts }: { initialProducts: Product[] }) {
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<CatalogFilters>(() => ({
    term: '',
    category: searchParams.get('categoria') || '',
    subcategory: searchParams.get('subcategoria') || '',
    color: '',
    size: '',
    destaque: searchParams.get('destaque') || '',
    publico: searchParams.get('publico') || '',
  }));
  const [highlights, setHighlights] = useState<Highlight[]>([]);

  // Cliente, não server component — mesma razão do SideMenu: manter
  // highlights.json fresco sem forçar a rota inteira a virar dynamic.
  useEffect(() => {
    fetch('/api/highlights')
      .then((r) => r.json())
      .then(setHighlights)
      .catch(() => {});
  }, []);

  const options = useMemo(
    () => ({
      categories: getCategories(initialProducts),
      colors: getColors(initialProducts),
      sizes: getSizes(initialProducts),
    }),
    [initialProducts]
  );

  const highlight = useMemo(
    () => highlights.find((h) => h.id === filters.destaque),
    [highlights, filters.destaque]
  );
  const audience = useMemo(
    () => CONFIG.home?.audiences?.find((a) => a.id === filters.publico),
    [filters.publico]
  );

  const filteredProducts = useMemo(() => {
    const term = filters.term.trim().toLowerCase();
    return initialProducts.filter((p) => {
      const matchesTerm = !term || (p.name || '').toLowerCase().includes(term) || (p.id || '').toLowerCase().includes(term);
      // Categorias "dobradas" no menu (ex.: BODY ALCA vira subcategoria de
      // BODY) têm produtos cujo campo `category` real é o nome dobrado — esse
      // produto some do filtro se a gente só comparar contra `subcategory`.
      const isFoldedMatch = !!filters.subcategory && p.category === filters.subcategory;
      const matchesCat = !filters.category || p.category === filters.category || isFoldedMatch;
      const matchesSubcat = !filters.subcategory || p.subcategory === filters.subcategory || isFoldedMatch;
      const matchesColor = !filters.color || (p.colors || []).includes(filters.color);
      const matchesSize = !filters.size || (p.sizes || []).includes(filters.size);
      // Destaque/público são tags de agrupamento (lista de IDs), não a
      // taxonomia categoria/subcategoria — destaques vêm de /api/highlights
      // (editável em /colecoes), públicos ainda em CONFIG.home.audiences.
      const matchesHighlight = !highlight || (highlight.productIds || []).includes(p.id);
      const matchesAudience = !audience || !audience.productIds || audience.productIds.includes(p.id);
      return matchesTerm && matchesCat && matchesSubcat && matchesColor && matchesSize && matchesHighlight && matchesAudience;
    });
  }, [initialProducts, filters, highlight, audience]);

  return (
    <>
      <main className={publicUi.container}>
        <Filters
          options={options}
          filters={filters}
          onChange={setFilters}
          onClear={() => setFilters({ term: '', category: '', subcategory: '', color: '', size: '', destaque: '', publico: '' })}
        />
        {initialProducts.length === 0 ? (
          <div className={publicUi.grid}>
            {Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)}
          </div>
        ) : (
          <>
            <div className={publicUi.resultCount}>{filteredProducts.length} {filteredProducts.length === 1 ? 'produto encontrado' : 'produtos encontrados'}</div>
            {filteredProducts.length === 0 ? (
              <EmptyState
                title="Nenhum produto encontrado"
                description="Tente remover um filtro ou buscar por outro nome."
                action={<Button type="button" variant="outline" onClick={() => setFilters({ term: '', category: '', subcategory: '', color: '', size: '', destaque: '', publico: '' })}>Limpar filtros</Button>}
              />
            ) : (
              <div className={publicUi.grid}>{filteredProducts.map((p) => <ProductCard key={p.id} product={p} />)}</div>
            )}
          </>
        )}
      </main>

    </>
  );
}
