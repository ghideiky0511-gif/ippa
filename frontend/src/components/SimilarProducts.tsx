'use client';
import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import ProductCard from './ProductCard';
import type { Product } from '@/domain/products/types';

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
    <section className="mt-8 min-w-0">
      <div className="mb-3 flex items-center justify-between gap-3 [&>h2]:text-lg [&>h2]:font-bold">
        <h2 className="contents">Você também pode gostar</h2>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center rounded-control border border-border transition-[border-color,color,transform] hover:border-brand-primary hover:text-brand-primary hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => scrollByCard(-1)}
            disabled={atStart}
            aria-label="Ver anteriores"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center rounded-control border border-border transition-[border-color,color,transform] hover:border-brand-primary hover:text-brand-primary hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => scrollByCard(1)}
            disabled={atEnd}
            aria-label="Ver mais"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2" ref={trackRef} onScroll={updateEdges}>
        {products.map((p) => (
          <div key={p.id} className="w-32 shrink-0 snap-start sm:w-40">
            <ProductCard product={p} />
          </div>
        ))}
      </div>
    </section>
  );
}
