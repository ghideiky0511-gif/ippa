'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Filters from './Filters';
import ProductCard from './ProductCard';
import ProductQuickView from './ProductQuickView';
import { getCategories, getColors, getSizes } from '@/lib/catalogFacets';
import { CONFIG } from '@/lib/config';

export default function CatalogApp({ initialProducts }) {
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState(() => ({
    term: '',
    category: searchParams.get('categoria') || '',
    subcategory: searchParams.get('subcategoria') || '',
    color: '',
    size: '',
    destaque: searchParams.get('destaque') || '',
    publico: searchParams.get('publico') || '',
  }));
  const [quickViewProduct, setQuickViewProduct] = useState(null);

  const options = useMemo(
    () => ({
      categories: getCategories(initialProducts),
      colors: getColors(initialProducts),
      sizes: getSizes(initialProducts),
    }),
    [initialProducts]
  );

  const highlight = useMemo(
    () => CONFIG.home?.highlights?.find((h) => h.id === filters.destaque),
    [filters.destaque]
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
      // taxonomia categoria/subcategoria — ver CONFIG.home.highlights/audiences.
      const matchesHighlight = !highlight || (highlight.productIds || []).includes(p.id);
      const matchesAudience = !audience || !audience.productIds || audience.productIds.includes(p.id);
      return matchesTerm && matchesCat && matchesSubcat && matchesColor && matchesSize && matchesHighlight && matchesAudience;
    });
  }, [initialProducts, filters, highlight, audience]);

  return (
    <>
      <main className="container">
        <Filters
          options={options}
          filters={filters}
          onChange={setFilters}
          onClear={() => setFilters({ term: '', category: '', subcategory: '', color: '', size: '', destaque: '', publico: '' })}
        />
        <div className="result-count">{filteredProducts.length} produto(s) encontrado(s)</div>
        <div className="grid">
          {filteredProducts.map((p) => (
            <ProductCard key={p.id} product={p} onOpenDetail={setQuickViewProduct} />
          ))}
        </div>
      </main>

      <ProductQuickView product={quickViewProduct} onClose={() => setQuickViewProduct(null)} />

      <footer>MVP de catálogo — dados de teste vindos do feed público da Fashion Girl Atacado.</footer>
    </>
  );
}
