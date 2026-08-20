'use client';

import { ArrowLeft, ChevronRight, Search, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import Link from '@/components/TenantLink';
import { CONFIG } from '@/lib/config';
import { formatBRL } from '@/lib/format';
import ProductImage from './ProductImage';
import { getSearchSuggestions } from '@/lib/search';
import { Input } from '@/components/ui/input';
import type { CategoryTreeEntry, Highlight } from '@/domain/catalog/types';
import type { Product } from '@/domain/products/types';

export default function SideMenu({ categoryTree }: { categoryTree: CategoryTreeEntry[] }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panel, setPanel] = useState<'menu' | 'categories'>('menu');
  const [activeAudience, setActiveAudience] = useState<string | null>(null);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState<Product[] | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [highlights, setHighlights] = useState<Highlight[]>([]);

  useEffect(() => {
    // Portal rendering must wait until document.body exists after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    fetch('/api/highlights').then((r) => r.json()).then(setHighlights).catch(() => {});
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
      fetch('/api/catalog').then((r) => r.json()).then(setCatalog).finally(() => setLoadingCatalog(false));
    }
  }

  function toggleAudience(audienceId: string) {
    if (panel === 'categories' && activeAudience === audienceId) { setPanel('menu'); return; }
    setActiveAudience(audienceId);
    setPanel('categories');
  }

  const suggestions = catalog ? getSearchSuggestions(catalog, query) : [];
  const audiences = CONFIG.home?.audiences || [];
  const menuLayer = (
    <>
      <button type="button" className={`fixed inset-0 z-[100] cursor-default bg-black/40 transition-opacity ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`} onClick={closeMenu} aria-label="Fechar menu" />
      <aside className={`fixed inset-y-0 left-0 z-[101] w-[min(22rem,88vw)] overflow-hidden bg-surface shadow-float transition-transform duration-300 ${open ? 'translate-x-0' : '-translate-x-full'}`} aria-label="Menu lateral" aria-hidden={!open}>
        <div className={`absolute inset-0 flex flex-col overflow-y-auto bg-surface transition-transform duration-300 ${panel === 'categories' ? '-translate-x-full' : ''}`}>
          <div className="flex min-h-16 items-center justify-between border-b border-border px-5">
            <span className="text-xs font-extrabold tracking-[0.12em] text-brand-primary uppercase">Explorar</span>
            <button type="button" className="inline-flex size-11 items-center justify-center rounded-control text-muted-foreground hover:bg-brand-background hover:text-foreground" aria-label="Fechar" onClick={closeMenu}><X className="size-5" /></button>
          </div>
          <div className="border-b border-border p-5">
            {searchOpen ? <>
              <Input autoFocus type="search" placeholder="Digite o nome da peça..." value={query} onChange={(e) => setQuery(e.target.value)} />
              <div className="mt-3 space-y-1">
                {loadingCatalog && <p className="text-sm text-muted-foreground">Carregando produtos...</p>}
                {!loadingCatalog && query.trim() && suggestions.length === 0 && <p className="text-sm text-muted-foreground">Nada encontrado.</p>}
                {suggestions.map((p) => <Link key={p.id} href={`/produto/${p.id}`} className="flex items-center gap-3 rounded-control p-2 hover:bg-brand-background" onClick={closeMenu}>
                  <ProductImage src={p.image} alt="" className="h-12 w-10 shrink-0 rounded-md bg-brand-background" />
                  <span className="min-w-0"><span className="block truncate text-sm font-semibold">{p.name}</span><span className="text-xs text-muted-foreground">{formatBRL(p.price)}</span></span>
                </Link>)}
              </div>
            </> : <button type="button" className="flex min-h-11 w-full items-center gap-2 rounded-control border border-border px-3 text-sm text-muted-foreground hover:border-brand-primary hover:text-brand-primary" onClick={openSearch}><Search className="size-4" />Buscar no catálogo</button>}
          </div>
          {highlights.length > 0 && <div className="border-b border-border px-5 py-3">{highlights.map((h) => <Link key={h.id} href={`/catalogo?destaque=${encodeURIComponent(h.id)}`} className="flex min-h-11 items-center text-sm font-semibold hover:text-brand-primary" onClick={closeMenu}>{h.label}</Link>)}</div>}
          {audiences.length > 0 && <div className="border-b border-border px-5 py-3">{audiences.map((a) => <button key={a.id} type="button" className={`flex min-h-11 w-full items-center justify-between text-left text-sm ${panel === 'categories' && activeAudience === a.id ? 'font-bold text-brand-primary' : 'font-semibold text-foreground'}`} onClick={() => toggleAudience(a.id)}>{a.label}<ChevronRight className="size-4" /></button>)}</div>}
          <div className="px-5 py-3"><Link href="/catalogo" className="flex min-h-11 items-center text-sm font-semibold hover:text-brand-primary" onClick={closeMenu}>Catálogo completo</Link><Link href="/pedidos" className="flex min-h-11 items-center text-sm font-semibold hover:text-brand-primary" onClick={closeMenu}>Meus pedidos</Link></div>
        </div>
        <div className={`absolute inset-0 flex flex-col overflow-y-auto bg-surface transition-transform duration-300 ${panel === 'categories' ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="flex min-h-16 items-center border-b border-border px-5"><button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-control px-2 text-sm font-bold text-brand-primary hover:bg-brand-background" onClick={() => setPanel('menu')}><ArrowLeft className="size-4" />Voltar</button></div>
          <div className="p-5">{(categoryTree || []).map(({ category, subcategories }) => {
            const base = `/catalogo?publico=${encodeURIComponent(activeAudience || '')}&categoria=${encodeURIComponent(category)}`;
            if (subcategories.length === 0) return <Link key={category} href={base} className="flex min-h-11 items-center text-sm font-semibold hover:text-brand-primary" onClick={closeMenu}>{category}</Link>;
            const isOpen = openCategory === category;
            return <div key={category} className="border-b border-border py-1"><button type="button" className="flex min-h-11 w-full items-center justify-between text-left text-sm font-semibold" onClick={() => setOpenCategory(isOpen ? null : category)}>{category}<ChevronRight className={`size-4 transition-transform ${isOpen ? 'rotate-90' : ''}`} /></button>{isOpen && <div className="pb-2 pl-3"><Link href={base} className="flex min-h-10 items-center text-sm font-semibold text-brand-primary" onClick={closeMenu}>Ver tudo</Link>{subcategories.map((sub) => <Link key={sub} href={`${base}&subcategoria=${encodeURIComponent(sub)}`} className="flex min-h-10 items-center text-sm text-muted-foreground hover:text-brand-primary" onClick={closeMenu}>{sub}</Link>)}</div>}</div>;
          })}</div>
        </div>
      </aside>
    </>
  );

  return <>{/* The trigger remains in the header; the layer is portalled to escape its stacking context. */}<button type="button" className="flex size-11 items-center justify-center rounded-control text-foreground hover:bg-brand-background" aria-label="Abrir menu" onClick={() => setOpen(true)}><span className="flex flex-col gap-1"><span className="block h-0.5 w-5 rounded bg-current" /><span className="block h-0.5 w-5 rounded bg-current" /><span className="block h-0.5 w-5 rounded bg-current" /></span></button>{mounted && createPortal(menuLayer, document.body)}</>;
}
