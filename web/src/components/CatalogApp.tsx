'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Filters from './Filters';
import ProductCard from './ProductCard';
import { getCategories, getColors, getProductsByIds, getSizes } from '@/lib/catalogFacets';
import { CONFIG } from '@/lib/config';
import type { Highlight, Product } from '@/lib/types';

export interface CatalogFilters {
  term: string;
  category: string;
  subcategory: string;
  color: string;
  size: string;
  destaque: string;
  publico: string;
}

interface CatalogSection {
  id: string;
  label: string;
  products: Product[];
}

export default function CatalogApp({ initialProducts }: { initialProducts: Product[] }) {
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<CatalogFilters>(() => ({
    term: '',
    category: searchParams.get('categoria') || '',
    subcategory: searchParams.get('subcategoria') || '',
    color: '',
    size: '',
    destaque: searchParams.get('destaque') || '',
    publico: searchParams.get('publico') || '',
  }));
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [highlightsLoaded, setHighlightsLoaded] = useState(false);

  // Cliente, não server component — mesma razão do SideMenu: manter
  // highlights.json fresco sem forçar a rota inteira a virar dynamic.
  useEffect(() => {
    fetch('/api/highlights')
      .then((r) => r.json())
      .then(setHighlights)
      .catch(() => {})
      .finally(() => setHighlightsLoaded(true));
  }, []);

  const options = useMemo(
    () => ({
      categories: getCategories(initialProducts),
      colors: getColors(initialProducts),
      sizes: getSizes(initialProducts),
    }),
    [initialProducts]
  );

  const highlight = useMemo(
    () => highlights.find((h) => h.id === filters.destaque),
    [highlights, filters.destaque]
  );
  const audience = useMemo(
    () => CONFIG.home?.audiences?.find((a) => a.id === filters.publico),
    [filters.publico]
  );

  const filteredProducts = useMemo(() => {
    const term = filters.term.trim().toLowerCase();
    return initialProducts.filter((p) => {
      const matchesTerm = !term || (p.name || '').toLowerCase().includes(term) || (p.id || '').toLowerCase().includes(term);
      // Categorias "dobradas" no menu (ex.: BODY ALCA vira subcategoria de
      // BODY) têm produtos cujo campo `category` real é o nome dobrado — esse
      // produto some do filtro se a gente só comparar contra `subcategory`.
      const isFoldedMatch = !!filters.subcategory && p.category === filters.subcategory;
      const matchesCat = !filters.category || p.category === filters.category || isFoldedMatch;
      const matchesSubcat = !filters.subcategory || p.subcategory === filters.subcategory || isFoldedMatch;
      const matchesColor = !filters.color || (p.colors || []).includes(filters.color);
      const matchesSize = !filters.size || (p.sizes || []).includes(filters.size);
      // Destaque/público são tags de agrupamento (lista de IDs), não a
      // taxonomia categoria/subcategoria — destaques vêm de /api/highlights
      // (editável em /colecoes), públicos ainda em CONFIG.home.audiences.
      const matchesHighlight = !highlight || (highlight.productIds || []).includes(p.id);
      const matchesAudience = !audience || !audience.productIds || audience.productIds.includes(p.id);
      return matchesTerm && matchesCat && matchesSubcat && matchesColor && matchesSize && matchesHighlight && matchesAudience;
    });
  }, [initialProducts, filters, highlight, audience]);

  // Chave só dos filtros "estruturais" (não o texto livre, que muda a cada
  // tecla) — remonta a grade pra replay da animação de entrada dos cards
  // quando a pessoa troca categoria/cor/tamanho/destaque, sem piscar a
  // cada letra digitada na busca.
  const structuralFilterKey = [filters.category, filters.subcategory, filters.color, filters.size, filters.destaque, filters.publico].join('|');

  // Catálogo em vitrines (não uma grade única): a coleção da estação
  // ("Verão 2027", cadastrada em /colecoes na plataforma admin), as peças
  // "atemporais" (mesmo mecanismo de coleção, tag manual em /colecoes — no
  // MVP, Cropped e Shorts Saia) e as peças com desconto "peças específicas"
  // ativo (/descontos). Cada vitrine é o resultado dos filtros da barra
  // lateral cruzado com o critério da vitrine — uma peça pode aparecer em
  // mais de uma (ex.: cropped em promoção some em Atemporal E Promoções).
  // Vitrine sem nenhuma peça (filtro zerou ou coleção vazia) some da barra
  // de abas junto — não faz sentido oferecer uma aba pra rolar até nada.
  const sections = useMemo<CatalogSection[]>(() => {
    const verao = highlights.find((h) => h.id === 'verao-2027');
    const atemporal = highlights.find((h) => h.id === 'atemporal');
    const raw: CatalogSection[] = [
      { id: 'verao-2027', label: verao?.label || 'Verão 2027', products: getProductsByIds(filteredProducts, verao?.productIds || []) },
      { id: 'atemporal', label: atemporal?.label || 'Atemporal', products: getProductsByIds(filteredProducts, atemporal?.productIds || []) },
      { id: 'promocoes', label: 'Promoções', products: filteredProducts.filter((p) => !!p.activeDiscount) },
    ];
    return raw.filter((s) => s.products.length > 0);
  }, [filteredProducts, highlights]);

  const [activeId, setActiveId] = useState('');
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const tabsRef = useRef<HTMLDivElement>(null);
  const [underline, setUnderline] = useState({ left: 0, width: 0 });

  // Espera highlightsLoaded antes de escolher a aba padrão pelo mesmo
  // motivo do hash-sync logo abaixo: antes da busca de highlights.json
  // resolver, `sections` só tem "Promoções" (não depende de highlight), e
  // esse efeito travaria activeId nela — como "promocoes" continua sendo
  // um id válido depois que Verão 2027/Atemporal aparecem, o `!sections.some`
  // nunca mais dispara de novo e a aba errada fica marcada como ativa pro
  // resto da visita.
  useEffect(() => {
    if (!highlightsLoaded || sections.length === 0) return;
    if (!sections.some((s) => s.id === activeId)) setActiveId(sections[0].id);
  }, [highlightsLoaded, sections, activeId]);

  // Link direto pra uma vitrine (ex.: /catalogo#promocoes, campanha de
  // WhatsApp) — highlights.json chega via fetch client-side (useEffect lá
  // em cima), então a rolagem nativa do navegador pro #hash acontece cedo
  // demais, antes das vitrines existirem de verdade, e perde a posição
  // quando elas aparecem. Corrige sozinho assim que a busca de highlights
  // termina (sucesso ou falha — `highlightsLoaded`) e as vitrines já
  // refletem o estado final, não o primeiro que aparecer (senão trava
  // numa posição que "Promoções" nem vai mais ocupar quando Verão
  // 2027/Atemporal aparecerem por cima dela). Só na carga inicial
  // (hasSyncedHash trava depois de rodar uma vez — filtro novo não deve
  // arrancar a pessoa de onde ela rolou por conta).
  const hasSyncedHash = useRef(false);
  useEffect(() => {
    if (hasSyncedHash.current || !highlightsLoaded) return;
    const hash = window.location.hash.slice(1);
    if (!hash) {
      hasSyncedHash.current = true;
      return;
    }
    const el = sectionRefs.current.get(hash);
    if (el) {
      el.scrollIntoView({ block: 'start' });
      setActiveId(hash);
    }
    hasSyncedHash.current = true;
  }, [sections, highlightsLoaded]);

  // Aba ativa acompanha a rolagem (scrollspy): a "banda de detecção" fica
  // colada no topo (compensando topnav + barra de abas, ambas sticky) e
  // rasa embaixo, pra só contar a vitrine que está de fato começando a
  // aparecer, não qualquer uma parcialmente visível na tela toda.
  useEffect(() => {
    if (sections.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        const topmost = visible.reduce((a, b) => (a.boundingClientRect.top < b.boundingClientRect.top ? a : b));
        const id = topmost.target.getAttribute('data-section-id');
        if (id) setActiveId(id);
      },
      { rootMargin: '-140px 0px -70% 0px', threshold: 0 }
    );
    sections.forEach((s) => {
      const el = sectionRefs.current.get(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [sections]);

  useLayoutEffect(() => {
    function measure() {
      const btn = tabRefs.current.get(activeId);
      const container = tabsRef.current;
      if (!btn || !container) return;
      setUnderline({ left: btn.offsetLeft, width: btn.offsetWidth });
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [activeId, sections]);

  function goToSection(id: string) {
    setActiveId(id);
    sectionRefs.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <>
      <main className="container catalog-page">
        <div className="catalog-header">
          <h1 className="catalog-title">Catálogo</h1>
        </div>

        <div className="catalog-layout">
          <aside className="catalog-sidebar">
            <p className="catalog-subtitle">{filteredProducts.length} produto(s) encontrado(s)</p>
            <Filters
              options={options}
              filters={filters}
              onChange={setFilters}
              onClear={() => setFilters({ term: '', category: '', subcategory: '', color: '', size: '', destaque: '', publico: '' })}
            />
          </aside>

          <div className="catalog-main">
            {/* Espera a busca de highlights.json terminar antes de mostrar
                qualquer vitrine — sem isso, "Promoções" (que não depende
                de highlight) pisca sozinha por cima da tela por um
                instante e "pula" pra baixo assim que Verão 2027/Atemporal
                chegam depois, empurrando tudo. Melhor um instante em
                branco do que esse solavanco de layout. */}
            {!highlightsLoaded && <p className="catalog-loading">Carregando vitrines…</p>}
            {highlightsLoaded && sections.length > 1 && (
              <nav className="catalog-tabs" ref={tabsRef}>
                {sections.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    ref={(el) => {
                      if (el) tabRefs.current.set(s.id, el);
                      else tabRefs.current.delete(s.id);
                    }}
                    className={'catalog-tab' + (s.id === activeId ? ' active' : '')}
                    onClick={() => goToSection(s.id)}
                  >
                    {s.label}
                  </button>
                ))}
                <span
                  className="catalog-tab-underline"
                  style={{ transform: `translateX(${underline.left}px)`, width: underline.width }}
                />
              </nav>
            )}

            {highlightsLoaded &&
              sections.map((s) => (
                <section
                  key={s.id}
                  id={s.id}
                  data-section-id={s.id}
                  ref={(el) => {
                    if (el) sectionRefs.current.set(s.id, el);
                    else sectionRefs.current.delete(s.id);
                  }}
                  className="catalog-section"
                >
                  <h2 className="catalog-section-title">{s.label}</h2>
                  <div className="grid" key={structuralFilterKey}>
                    {s.products.map((p) => (
                      <ProductCard key={p.id} product={p} />
                    ))}
                  </div>
                </section>
              ))}

            {highlightsLoaded && sections.length === 0 && <p className="preview-empty-text">Nenhum produto encontrado.</p>}
          </div>
        </div>
      </main>

      <footer>MVP de catálogo — dados de teste vindos do feed público da Fashion Girl Atacado.</footer>
    </>
  );
}
