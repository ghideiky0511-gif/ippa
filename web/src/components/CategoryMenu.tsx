'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

// Categorias com subcategoria viram um dropdown: no desktop abre passando o
// mouse em cima (CSS puro, @media hover:hover), no mobile abre com um toque
// (a classe .open, controlada aqui por clique). O submenu fica sempre no DOM
// (só opacity/visibility mudam, pra animar), então categorias perto da borda
// direita teriam o submenu vazando pra fora da tela — checkAlignment mede
// isso e vira a ancoragem pra direita quando necessário, evitando o scroll
// lateral fantasma que isso causava na página inteira.
export default function CategoryMenu({ categoryTree }) {
  const [openCategory, setOpenCategory] = useState(null);
  const [alignRight, setAlignRight] = useState(() => new Set());
  const submenuRefs = useRef(new Map());

  // Mede todo mundo já na primeira renderização — sem isso, um submenu que
  // vaza pra fora da tela conta na largura da página antes mesmo do usuário
  // encostar no menu (é essa largura fantasma que causava o scroll lateral).
  useEffect(() => {
    (categoryTree || []).forEach(({ category, subcategories }) => {
      if (subcategories.length > 0) checkAlignment(category);
    });
  }, [categoryTree]);

  if (!categoryTree?.length) return null;

  function toggle(category) {
    setOpenCategory((current) => (current === category ? null : category));
  }

  function checkAlignment(category) {
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
    <nav className="category-menu">
      {categoryTree.map(({ category, subcategories }) => {
        if (subcategories.length === 0) {
          return (
            <Link key={category} href={`/catalogo?categoria=${encodeURIComponent(category)}`} className="category-pill">
              {category}
            </Link>
          );
        }
        const itemClass =
          'category-item' + (openCategory === category ? ' open' : '') + (alignRight.has(category) ? ' align-right' : '');
        return (
          <div key={category} className={itemClass} onMouseEnter={() => checkAlignment(category)}>
            <button
              type="button"
              className="category-pill"
              onClick={() => {
                toggle(category);
                checkAlignment(category);
              }}
            >
              {category}
            </button>
            <div
              className="category-submenu"
              ref={(el) => {
                if (el) submenuRefs.current.set(category, el);
                else submenuRefs.current.delete(category);
              }}
            >
              <Link href={`/catalogo?categoria=${encodeURIComponent(category)}`} className="category-submenu-item all">
                Ver tudo em {category}
              </Link>
              {subcategories.map((sub) => (
                <Link
                  key={sub}
                  href={`/catalogo?categoria=${encodeURIComponent(category)}&subcategoria=${encodeURIComponent(sub)}`}
                  className="category-submenu-item"
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
