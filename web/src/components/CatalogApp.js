'use client';

import { useMemo, useState } from 'react';
import Banner from './Banner';
import Filters from './Filters';
import ProductCard from './ProductCard';
import ProductQuickView from './ProductQuickView';

const EMPTY_FILTERS = { term: '', category: '', color: '', size: '' };

export default function CatalogApp({ initialProducts }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [quickViewProduct, setQuickViewProduct] = useState(null);

  const options = useMemo(() => {
    const categories = Array.from(new Set(initialProducts.map((p) => p.category).filter(Boolean))).sort();
    const colors = Array.from(new Set(initialProducts.flatMap((p) => p.colors || []).filter(Boolean))).sort();
    const sizes = Array.from(new Set(initialProducts.flatMap((p) => p.sizes || []).filter(Boolean)))
      .sort((a, b) => (isNaN(a) || isNaN(b) ? a.localeCompare(b) : Number(a) - Number(b)));
    return { categories, colors, sizes };
  }, [initialProducts]);

  const filteredProducts = useMemo(() => {
    const term = filters.term.trim().toLowerCase();
    return initialProducts.filter((p) => {
      const matchesTerm = !term || (p.name || '').toLowerCase().includes(term) || (p.id || '').toLowerCase().includes(term);
      const matchesCat = !filters.category || p.category === filters.category;
      const matchesColor = !filters.color || (p.colors || []).includes(filters.color);
      const matchesSize = !filters.size || (p.sizes || []).includes(filters.size);
      return matchesTerm && matchesCat && matchesColor && matchesSize;
    });
  }, [initialProducts, filters]);

  return (
    <>
      <Banner />
      <main className="container">
        <Filters options={options} filters={filters} onChange={setFilters} onClear={() => setFilters(EMPTY_FILTERS)} />
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
