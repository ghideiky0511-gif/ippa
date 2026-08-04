'use client';

import { useState } from 'react';
import HomeBanner from './HomeBanner';
import ProductCard from './ProductCard';
import ProductQuickView from './ProductQuickView';

export default function HomeApp({ featuredProducts }) {
  const [quickViewProduct, setQuickViewProduct] = useState(null);

  return (
    <>
      <HomeBanner />

      <main className="container">
        {featuredProducts.length > 0 && (
          <section className="featured-section">
            <h2 className="section-title">Produtos em destaque</h2>
            <div className="grid">
              {featuredProducts.map((p) => (
                <ProductCard key={p.id} product={p} onOpenDetail={setQuickViewProduct} />
              ))}
            </div>
          </section>
        )}
      </main>

      <ProductQuickView product={quickViewProduct} onClose={() => setQuickViewProduct(null)} />

      <footer>MVP de catálogo — dados de teste vindos do feed público da Fashion Girl Atacado.</footer>
    </>
  );
}
