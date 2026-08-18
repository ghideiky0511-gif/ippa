'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CONFIG } from '@/lib/config';
import { formatBRL } from '@/lib/format';
import { getSearchSuggestions } from '@/lib/search';
import type { CategoryTreeEntry, Highlight } from '@/domain/catalog/types';
import type { Product } from '@/domain/products/types';

// Menu lateral global (hamburguer -> drawer da esquerda). Painel 1 tem busca
// + destaques + públicos. Clicar num público abre o painel 2 (categorias
// daquele público): em telas largas (>=700px) o drawer cresce e o painel 2
// aparece do lado do painel 1 (os dois ficam visíveis); em telas estreitas
// não cabem as duas colunas, então o painel 2 desliza por cima do painel 1
// (mesma técnica de transform+.open do CartDrawer/ProductQuickView), com um
// "← Voltar" pra reabrir o painel 1.
export default function SideMenu({ categoryTree }: { categoryTree: CategoryTreeEntry[] }) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<'menu' | 'categories'>('menu');
  const [activeAudience, setActiveAudience] = useState<string | null>(null);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState<Product[] | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [highlights, setHighlights] = useState<Highlight[]>([]);

  // Busca no cliente (não no server component do layout) de propósito: assim
  // só essa chamada fica "sempre fresca" (sem cache), sem forçar o app
  // inteiro a virar dynamic só pra manter o menu atualizado — ver
  // web/src/app/api/highlights/route.ts.
  useEffect(() => {
    fetch('/api/highlights')
      .then((r) => r.json())
      .then(setHighlights)
      .catch(() => {});
  }, []);

  function closeMenu() {
    setOpen(false);
    setPanel('menu');
    setSearchOpen(false);
    setQuery('');
    setOpenCategory(null);
  }

  function openSearch() {
    setSearchOpen(true);
    if (!catalog && !loadingCatalog) {
      setLoadingCatalog(true);
      fetch('/api/catalog')
        .then((r) => r.json())
        .then((data) => setCatalog(data))
        .finally(() => setLoadingCatalog(false));
    }
  }

  function toggleAudience(audienceId: string) {
    if (panel === 'categories' && activeAudience === audienceId) {
      setPanel('menu');
      return;
    }
    setActiveAudience(audienceId);
    setPanel('categories');
  }

  const suggestions = catalog ? getSearchSuggestions(catalog, query) : [];
  const audiences = CONFIG.home?.audiences || [];

  return (
    <>
      <button type="button" className="sidemenu-trigger" aria-label="Abrir menu" onClick={() => setOpen(true)}>
        <span />
        <span />
        <span />
      </button>

      <div className={'sidemenu-overlay' + (open ? ' open' : '')} onClick={closeMenu} />

      <aside className={'sidemenu-drawer' + (open ? ' open' : '') + (panel === 'categories' ? ' panel2-open' : '')}>
        <div className={'sidemenu-panel' + (panel === 'categories' ? ' shifted' : '')}>
          <div className="sidemenu-header">
            <button type="button" aria-label="Fechar" onClick={closeMenu}>&times;</button>
          </div>

          <div className="sidemenu-search">
            <button type="button" className="sidemenu-search-toggle" onClick={openSearch} aria-label="Buscar">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
            {searchOpen && (
              <div className="sidemenu-search-box">
                <input
                  autoFocus
                  type="text"
                  placeholder="Digite o nome da peça..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {loadingCatalog && <div className="sidemenu-search-hint">Carregando...</div>}
                {!loadingCatalog && query.trim() && suggestions.length === 0 && (
                  <div className="sidemenu-search-hint">Nada encontrado.</div>
                )}
                {suggestions.map((p) => (
                  <Link key={p.id} href={`/produto/${p.id}`} className="sidemenu-search-result" onClick={closeMenu}>
                    <img src={p.image || 'https://via.placeholder.com/72x90?text=Sem+imagem'} alt={p.name} />
                    <div>
                      <div className="name">{p.name}</div>
                      <div className="price">{formatBRL(p.price)}</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {highlights.length > 0 && (
            <div className="sidemenu-section">
              {highlights.map((h) => (
                <Link
                  key={h.id}
                  href={`/catalogo?destaque=${encodeURIComponent(h.id)}`}
                  className="sidemenu-highlight-link"
                  onClick={closeMenu}
                >
                  {h.label}
                </Link>
              ))}
            </div>
          )}

          {audiences.length > 0 && (
            <div className="sidemenu-section">
              {audiences.map((a) => {
                const isActive = panel === 'categories' && activeAudience === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    className={'sidemenu-audience-link' + (isActive ? ' active' : '')}
                    onClick={() => toggleAudience(a.id)}
                  >
                    {a.label} <span className="sidemenu-arrow">›</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="sidemenu-section">
            <Link href="/catalogo" className="sidemenu-category-link" onClick={closeMenu}>
              Catálogo completo
            </Link>
            <Link href="/pedidos" className="sidemenu-category-link" onClick={closeMenu}>
              Meus pedidos
            </Link>
          </div>
        </div>

        <div className={'sidemenu-panel sidemenu-panel-2' + (panel === 'categories' ? ' shifted' : '')}>
          <div className="sidemenu-header">
            <button type="button" className="sidemenu-back" onClick={() => setPanel('menu')}>
              &larr; Voltar
            </button>
          </div>
          <div className="sidemenu-categories">
            {(categoryTree || []).map(({ category, subcategories }) => {
              const base = `/catalogo?publico=${encodeURIComponent(activeAudience || '')}&categoria=${encodeURIComponent(category)}`;
              if (subcategories.length === 0) {
                return (
                  <Link key={category} href={base} className="sidemenu-category-link" onClick={closeMenu}>
                    {category}
                  </Link>
                );
              }
              const isOpen = openCategory === category;
              return (
                <div key={category} className="sidemenu-category-group">
                  <button
                    type="button"
                    className={'sidemenu-category-toggle' + (isOpen ? ' open' : '')}
                    onClick={() => setOpenCategory(isOpen ? null : category)}
                  >
                    {category} <span className="sidemenu-arrow">›</span>
                  </button>
                  {isOpen && (
                    <div className="sidemenu-subcategories">
                      <Link href={base} className="sidemenu-subcategory-link all" onClick={closeMenu}>
                        Ver tudo em {category} →
                      </Link>
                      {subcategories.map((sub) => (
                        <Link
                          key={sub}
                          href={`${base}&subcategoria=${encodeURIComponent(sub)}`}
                          className="sidemenu-subcategory-link"
                          onClick={closeMenu}
                        >
                          {sub}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </aside>
    </>
  );
}
