'use client';

import { useState } from 'react';
import Link from 'next/link';

// Categorias com subcategoria viram um dropdown: no desktop abre passando o
// mouse em cima (CSS puro, @media hover:hover), no mobile abre com um toque
// (a classe .open, controlada aqui por clique).
export default function CategoryMenu({ categoryTree }) {
  const [openCategory, setOpenCategory] = useState(null);

  if (!categoryTree?.length) return null;

  function toggle(category) {
    setOpenCategory((current) => (current === category ? null : category));
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
        return (
          <div key={category} className={'category-item' + (openCategory === category ? ' open' : '')}>
            <button type="button" className="category-pill" onClick={() => toggle(category)}>
              {category}
            </button>
            <div className="category-submenu">
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
