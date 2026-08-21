'use client';
import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import ProductCard from './ProductCard';
import type { Product } from '@/domain/products/types';

function SimilarProductsSkeleton() {
  return (
    <section className="mt-8 min-w-0" aria-busy="true" aria-label="Carregando produtos similares">
      <div className="mb-3 h-6 w-52 animate-pulse rounded bg-surface-muted" />
      <div className="flex gap-3 overflow-hidden pb-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="w-32 shrink-0 sm:w-40">
            <div className="aspect-[4/5] animate-pulse rounded-brand bg-surface-muted" />
            <div className="mt-3 h-4 w-4/5 animate-pulse rounded bg-surface-muted" />
            <div className="mt-2 h-4 w-2/5 animate-pulse rounded bg-surface-muted" />
          </div>
        ))}
      </div>
    </section>
  );
}

// Fileira horizontal de "produtos similares" (regra configurável em
// /ferramentas, ver web/src/lib/similarProducts.ts) — usada na página
// cheia do produto, no quick-view e no carrinho. Setas de navegação em vez
// de grade, pra não ocupar muito espaço nos dois últimos (drawers
// estreitos).
export default function SimilarProducts({ products, loading = false }: { products: Product[]; loading?: boolean }) {
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

  if (loading) return <SimilarProductsSkeleton />;
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
