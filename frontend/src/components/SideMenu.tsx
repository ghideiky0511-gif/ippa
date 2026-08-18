'use client';
import { publicUi } from '@/lib/ui';

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
      <button type="button" className={publicUi.menuTrigger} aria-label="Abrir menu" onClick={() => setOpen(true)}>
        <span />
        <span />
        <span />
      </button>

      <div className={[publicUi.overlay, open ? 'block' : 'hidden'].join(' ')} onClick={closeMenu} />

      <aside className={[publicUi.drawerLeft, open ? 'translate-x-0' : ''].join(' ')}>
        <div className={[publicUi.sidePanel, panel === 'categories' ? '-translate-x-full' : ''].join(' ')}>
          <div className={publicUi.sideHeader}>
            <button type="button" aria-label="Fechar" onClick={closeMenu}>&times;</button>
          </div>

          <div className={publicUi.sideSearch}>
            <button type="button" className={publicUi.sideSearchToggle} onClick={openSearch} aria-label="Buscar">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
            {searchOpen && (
              <div className={publicUi.sideSearchBox}>
                <input
                  autoFocus
                  type="text"
                  placeholder="Digite o nome da peça..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {loadingCatalog && <div className="contents">Carregando...</div>}
                {!loadingCatalog && query.trim() && suggestions.length === 0 && (
                  <div className="contents">Nada encontrado.</div>
                )}
                {suggestions.map((p) => (
                  <Link key={p.id} href={`/produto/${p.id}`} className={publicUi.sideSearchResult} onClick={closeMenu}>
                    <img src={p.image || 'https://via.placeholder.com/72x90?text=Sem+imagem'} alt={p.name} />
                    <div>
                      <div className="contents">{p.name}</div>
                      <div className="contents">{formatBRL(p.price)}</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {highlights.length > 0 && (
            <div className={publicUi.sideSection}>
              {highlights.map((h) => (
                <Link
                  key={h.id}
                  href={`/catalogo?destaque=${encodeURIComponent(h.id)}`}
                  className={publicUi.sideLink}
                  onClick={closeMenu}
                >
                  {h.label}
                </Link>
              ))}
            </div>
          )}

          {audiences.length > 0 && (
            <div className={publicUi.sideSection}>
              {audiences.map((a) => {
                const isActive = panel === 'categories' && activeAudience === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    className={`flex w-full cursor-pointer items-center justify-between border-0 bg-transparent py-2 text-left text-sm text-brand-text ${isActive ? 'font-semibold text-brand-primary' : ''}`}
                    onClick={() => toggleAudience(a.id)}
                  >
                    {a.label} <span className="contents">›</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className={publicUi.sideSection}>
            <Link href="/catalogo" className={publicUi.sideLink} onClick={closeMenu}>
              Catálogo completo
            </Link>
            <Link href="/pedidos" className={publicUi.sideLink} onClick={closeMenu}>
              Meus pedidos
            </Link>
          </div>
        </div>

        <div className={[publicUi.sidePanel, panel === 'categories' ? 'translate-x-0' : 'translate-x-full'].join(' ')}>
          <div className={publicUi.sideHeader}>
            <button type="button" className="contents" onClick={() => setPanel('menu')}>
              &larr; Voltar
            </button>
          </div>
          <div className="contents">
            {(categoryTree || []).map(({ category, subcategories }) => {
              const base = `/catalogo?publico=${encodeURIComponent(activeAudience || '')}&categoria=${encodeURIComponent(category)}`;
              if (subcategories.length === 0) {
                return (
                  <Link key={category} href={base} className={publicUi.sideLink} onClick={closeMenu}>
                    {category}
                  </Link>
                );
              }
              const isOpen = openCategory === category;
              return (
                <div key={category} className="contents">
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-center justify-between border-0 bg-transparent py-2 text-left text-sm text-brand-text"
                    onClick={() => setOpenCategory(isOpen ? null : category)}
                  >
                    {category} <span className="contents">›</span>
                  </button>
                  {isOpen && (
                    <div className="contents">
                      <Link href={base} className="contents" onClick={closeMenu}>
                        Ver tudo em {category} →
                      </Link>
                      {subcategories.map((sub) => (
                        <Link
                          key={sub}
                          href={`${base}&subcategoria=${encodeURIComponent(sub)}`}
                          className={publicUi.sideLink}
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
