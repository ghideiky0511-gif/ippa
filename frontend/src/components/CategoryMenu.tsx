'use client';
import { useEffect, useRef, useState } from 'react';
import Link from '@/components/TenantLink';
import type { CategoryTreeEntry } from '@/domain/catalog/types';

// Categorias com subcategoria viram um dropdown: no desktop abre passando o
// mouse em cima (CSS puro, @media hover:hover), no mobile abre com um toque
// (a classe .open, controlada aqui por clique). O submenu fica sempre no DOM
// (só opacity/visibility mudam, pra animar), então categorias perto da borda
// direita teriam o submenu vazando pra fora da tela — checkAlignment mede
// isso e vira a ancoragem pra direita quando necessário, evitando o scroll
// lateral fantasma que isso causava na página inteira.
export default function CategoryMenu({ categoryTree }: { categoryTree: CategoryTreeEntry[] }) {
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [alignRight, setAlignRight] = useState<Set<string>>(() => new Set());
  const submenuRefs = useRef(new Map<string, HTMLDivElement>());

  // Mede todo mundo já na primeira renderização — sem isso, um submenu que
  // vaza pra fora da tela conta na largura da página antes mesmo do usuário
  // encostar no menu (é essa largura fantasma que causava o scroll lateral).
  useEffect(() => {
    (categoryTree || []).forEach(({ category, subcategories }) => {
      if (subcategories.length > 0) checkAlignment(category);
    });
  }, [categoryTree]);

  if (!categoryTree?.length) return null;

  function toggle(category: string) {
    setOpenCategory((current) => (current === category ? null : category));
  }

  function checkAlignment(category: string) {
    const el = submenuRefs.current.get(category);
    if (!el) return;
    const overflowsRight = el.getBoundingClientRect().right > window.innerWidth;
    setAlignRight((prev) => {
      if (prev.has(category) === overflowsRight) return prev;
      const next = new Set(prev);
      if (overflowsRight) next.add(category);
      else next.delete(category);
      return next;
    });
  }

  return (
    <nav className="flex flex-wrap gap-2.5 border-b border-[#eee] bg-white px-4 py-3.5">
      {categoryTree.map(({ category, subcategories }) => {
        if (subcategories.length === 0) {
          return (
            <Link key={category} href={`/catalogo?categoria=${encodeURIComponent(category)}`} className="cursor-pointer rounded-full border border-[#ddd] bg-white px-3.5 py-1.5 text-[13px] whitespace-nowrap text-brand-text transition-[border-color,color,transform] hover:border-brand-primary hover:text-brand-primary">
              {category}
            </Link>
          );
        }
        const isOpen = openCategory === category;
        const itemClass = `group relative ${alignRight.has(category) ? 'text-right' : ''}`;
        return (
          <div key={category} className={itemClass} onMouseEnter={() => checkAlignment(category)}>
            <button
              type="button"
              className={`cursor-pointer rounded-full border bg-white px-3.5 py-1.5 text-[13px] whitespace-nowrap text-brand-text transition-[border-color,color,transform] hover:border-brand-primary hover:text-brand-primary ${isOpen ? 'border-brand-primary text-brand-primary' : 'border-[#ddd]'}`}
              onClick={() => {
                toggle(category);
                checkAlignment(category);
              }}
            >
              {category}
            </button>
            <div
              className={`absolute top-[calc(100%+6px)] z-20 flex min-w-[200px] flex-col rounded-lg bg-white p-1.5 text-left shadow-[0_6px_20px_rgba(0,0,0,0.15)] transition-[opacity,transform,visibility] duration-[180ms] ${alignRight.has(category) ? 'right-0' : 'left-0'} ${isOpen ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-1.5 opacity-0 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100'}`}
              ref={(el) => {
                if (el) submenuRefs.current.set(category, el);
                else submenuRefs.current.delete(category);
              }}
            >
              <Link href={`/catalogo?categoria=${encodeURIComponent(category)}`} className="mb-1 border-b border-[#eee] px-3 py-2.5 text-[13px] font-semibold whitespace-nowrap text-brand-text hover:bg-brand-background hover:text-brand-primary">
                Ver tudo em {category}
              </Link>
              {subcategories.map((sub) => (
                <Link
                  key={sub}
                  href={`/catalogo?categoria=${encodeURIComponent(category)}&subcategoria=${encodeURIComponent(sub)}`}
                  className="rounded-md px-3 py-2 text-[13px] whitespace-nowrap text-brand-text hover:bg-brand-background hover:text-brand-primary"
                >
                  {sub}
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
