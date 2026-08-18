'use client';

import { useRef, useState } from 'react';
import ProductCard from './ProductCard';
import type { Product } from '@/lib/types';

// Fileira horizontal de "produtos similares" (regra configurável em
// /ferramentas, ver web/src/lib/similarProducts.ts) — usada na página
// cheia do produto, no quick-view e no carrinho. Setas de navegação em vez
// de grade, pra não ocupar muito espaço nos dois últimos (drawers
// estreitos).
export default function SimilarProducts({ products }: { products: Product[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  function updateEdges() {
    const el = trackRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 0);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
  }

  function scrollByCard(dir: 1 | -1) {
    const el = trackRef.current;
    if (!el) return;
    const card = el.firstElementChild as HTMLElement | null;
    const amount = (card?.offsetWidth || 150) + 12;
    el.scrollBy({ left: dir * amount, behavior: 'smooth' });
  }

  if (products.length === 0) return null;

  return (
    <section className="similar-products">
      <div className="similar-products-header">
        <h2 className="similar-products-title">Você também pode gostar</h2>
        <div className="similar-products-arrows">
          <button
            type="button"
            className="similar-products-arrow"
            onClick={() => scrollByCard(-1)}
            disabled={atStart}
            aria-label="Ver anteriores"
          >
            ‹
          </button>
          <button
            type="button"
            className="similar-products-arrow"
            onClick={() => scrollByCard(1)}
            disabled={atEnd}
            aria-label="Ver mais"
          >
            ›
          </button>
        </div>
      </div>
      <div className="similar-products-track" ref={trackRef} onScroll={updateEdges}>
        {products.map((p) => (
          <div key={p.id} className="similar-products-item">
            <ProductCard product={p} />
          </div>
        ))}
      </div>
    </section>
  );
}
