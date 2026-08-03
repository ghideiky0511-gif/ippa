'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Filters from './Filters';
import ProductCard from './ProductCard';
import ProductQuickView from './ProductQuickView';
import { getCategories, getColors, getSizes } from '@/lib/catalogFacets';

export default function CatalogApp({ initialProducts }) {
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState(() => ({
    term: '',
    category: searchParams.get('categoria') || '',
    subcategory: searchParams.get('subcategoria') || '',
    color: '',
    size: '',
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

  const filteredProducts = useMemo(() => {
    const term = filters.term.trim().toLowerCase();
    return initialProducts.filter((p) => {
      const matchesTerm = !term || (p.name || '').toLowerCase().includes(term) || (p.id || '').toLowerCase().includes(term);
      const matchesCat = !filters.category || p.category === filters.category;
      const matchesSubcat = !filters.subcategory || p.subcategory === filters.subcategory;
      const matchesColor = !filters.color || (p.colors || []).includes(filters.color);
      const matchesSize = !filters.size || (p.sizes || []).includes(filters.size);
      return matchesTerm && matchesCat && matchesSubcat && matchesColor && matchesSize;
    });
  }, [initialProducts, filters]);

  return (
    <>
      <main className="container">
        <Filters
          options={options}
          filters={filters}
          onChange={setFilters}
          onClear={() => setFilters({ term: '', category: '', subcategory: '', color: '', size: '' })}
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
