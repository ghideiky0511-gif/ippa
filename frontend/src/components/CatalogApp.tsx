"use client";
import { publicUi } from "@/lib/ui";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Filters from "./Filters";
import ProductCard from "./ProductCard";
import ProductCardSkeleton from "./ProductCardSkeleton";
import { RowAutoplayGrid } from "./RowAutoplayGrid";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { enableImageCache } from "@/lib/image-cache";
import { takeCatalogScrollPosition } from "@/lib/catalog-scroll";
import { useTalao } from "./TalaoProvider";
import { useCart } from "./CartProvider";
import type { CatalogPage, CatalogSectionsResult } from "@/domain/catalog/types";
import type { Product } from "@/domain/products/types";
import type { CategoryTreeEntry } from "@/domain/catalog/types";

// Mesmo formato dos outros filtros (Select com "tanto faz"/"sim"/"não") em
// vez de um toggle avulso — ver Filters.tsx.
export type TriFilter = "" | "sim" | "nao";

export interface CatalogFilters {
    term: string;
    classificationId: string;
    color: string;
    size: string;
    // Client-side: recortam pelos ids do carrinho (ver ProductCard.tsx). Não
    // viram parâmetro de facet próprio — são mesclados em restrictIds/excludeIds.
    selected: TriFilter;
    suggested: TriFilter;
}

export interface CatalogFilterOptions {
    categories: CategoryTreeEntry[];
    colors: string[];
    sizes: string[];
}

const EMPTY_FILTERS: CatalogFilters = { term: "", classificationId: "", color: "", size: "", selected: "", suggested: "" };
const LOAD_MORE_ROOT_MARGIN = "600px 0px";
const REFETCH_DEBOUNCE_MS = 350;
// Scroll infinito nunca "esquece" o que já carregou — sem isso, uma sessão
// longa acumula centenas de <img> na grade de baixo e o navegador some com
// memória. Ao rolar pra cima, cortamos de volta pra essa quantidade de
// páginas (os itens mais recentes, no fim da lista, que já ficaram pra trás
// na rolagem); descer de novo até o fim busca essas páginas outra vez.
const WINDOW_PAGE_COUNT = 2;
const SCROLL_UP_THRESHOLD_PX = 4;
// Primeira fileira da grade (4 colunas no desktop) já está no primeiro paint
// — carrega eager/fetchPriority=high em vez de lazy, pra não atrasar o LCP.
const FIRST_ROW_PRIORITY_COUNT = 4;

// Monta os parâmetros de filtro (não pagina/não escolhe seção) — reutilizado
// tanto pra pedir um novo recorte de vitrines (mudança de filtro) quanto pra
// pedir mais uma página da grade de baixo (scroll infinito).
function facetParams(filters: CatalogFilters, restrictIds?: string[], excludeIds?: string[]): URLSearchParams {
    const params = new URLSearchParams();
    if (filters.term) params.set("term", filters.term);
    if (filters.classificationId) params.set("classificationId", filters.classificationId);
    if (filters.color) params.set("color", filters.color);
    if (filters.size) params.set("size", filters.size);
    if (restrictIds && restrictIds.length > 0) params.set("restrictIds", restrictIds.join(","));
    if (excludeIds && excludeIds.length > 0) params.set("excludeIds", excludeIds.join(","));
    return params;
}

interface BottomGrid {
    // "outros": grade de baixo exclui o que já apareceu nas vitrines acima
    // (há 2+ vitrines com produto). "all": não há vitrines o bastante pra
    // valer a pena separar — grade única com tudo que casou no filtro.
    mode: "outros" | "all";
    showSections: boolean;
    items: Product[];
    pagination: CatalogPage["pagination"];
}

function deriveBottomGrid(result: CatalogSectionsResult): BottomGrid {
    const groupCount = result.sections.length + (result.outros.pagination.total > 0 ? 1 : 0);
    const showSections = groupCount > 1;
    const page = showSections ? result.outros : result.all;
    return { mode: showSections ? "outros" : "all", showSections, items: page.items, pagination: page.pagination };
}

export default function CatalogApp({
    filterOptions,
    initialSections,
    initialFilters,
    restrictIds,
}: {
    filterOptions: CatalogFilterOptions;
    initialSections: CatalogSectionsResult;
    initialFilters: { classificationId: string };
    restrictIds?: string[];
}) {
    const searchParams = useSearchParams();
    const [filters, setFilters] = useState<CatalogFilters>({ ...EMPTY_FILTERS, ...initialFilters });
    const [sectionsResult, setSectionsResult] = useState<CatalogSectionsResult>(initialSections);
    const [bottomGrid, setBottomGrid] = useState<BottomGrid>(() => deriveBottomGrid(initialSections));
    const [loadingSections, setLoadingSections] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);

    useEffect(() => {
        enableImageCache();
    }, []);

    useEffect(() => {
        const scrollY = takeCatalogScrollPosition(window.location.pathname);
        if (scrollY === null) return;

        let frame = 0;
        let attempts = 0;
        const restoreScroll = () => {
            window.scrollTo(0, scrollY);
            attempts += 1;
            if (attempts < 30 && Math.abs(window.scrollY - scrollY) > 1) frame = requestAnimationFrame(restoreScroll);
        };
        frame = requestAnimationFrame(restoreScroll);
        return () => cancelAnimationFrame(frame);
    }, []);

    // Link profundo /catalogo?session=<id> (ex.: "Entrar no atendimento" em
    // /workspace/pedidos) — resume o pedido e o talão dela sem reativar esse
    // talão no servidor (ver TalaoProvider.resumeSession). talao é null pra
    // cliente/anônimo, então isso não faz nada fora do papel de vendedora.
    const talao = useTalao();
    const requestedSessionId = searchParams.get("session");
    const hasResumedSession = useRef(false);
    useEffect(() => {
        if (!requestedSessionId || !talao || hasResumedSession.current) return;
        const match = talao.sessions.find((s) => s.id === requestedSessionId);
        if (!match) return;
        talao.resumeSession(requestedSessionId);
        hasResumedSession.current = true;
    }, [requestedSessionId, talao]);

    // "Selecionados"/"sugeridos" (Filters.tsx, mesmo formato Select dos outros
    // filtros: "" | "sim" | "nao") recortam pelos ids do carrinho —
    // puramente client-side (o carrinho não é dado de catálogo). "sim" vira
    // restrição (só esses ids); "nao" vira exclusão — mesclados aqui em cima
    // do restrictIds normal (prop, usado por catálogo de público-alvo) em
    // vez de virarem mais facets no backend.
    const { cart } = useCart();
    const cartFilterIds = useMemo(() => {
        if (!filters.selected && !filters.suggested) return null;
        const selectedIds = new Set(cart.map((item) => item.id));
        const suggestedIds = new Set(cart.filter((item) => item.suggested).map((item) => item.id));

        let restrict: Set<string> | null = null;
        const exclude = new Set<string>();
        function intersect(base: Set<string> | null, extra: Set<string>): Set<string> {
            if (base === null) return new Set(extra);
            const next = new Set<string>();
            for (const id of base) if (extra.has(id)) next.add(id);
            return next;
        }

        if (filters.selected === "sim") restrict = intersect(restrict, selectedIds);
        if (filters.selected === "nao") selectedIds.forEach((id) => exclude.add(id));
        if (filters.suggested === "sim") restrict = intersect(restrict, suggestedIds);
        if (filters.suggested === "nao") suggestedIds.forEach((id) => exclude.add(id));

        return { restrict, exclude };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters.selected, filters.suggested, cart]);
    const cartFilterKey = cartFilterIds
        ? `${cartFilterIds.restrict ? Array.from(cartFilterIds.restrict).sort().join(",") : ""}|${Array.from(cartFilterIds.exclude).sort().join(",")}`
        : "";

    function effectiveIds(): { restrictIds?: string[]; excludeIds?: string[] } {
        let restrict = restrictIds;
        let exclude: string[] | undefined;

        if (cartFilterIds) {
            if (cartFilterIds.restrict !== null) {
                const cartRestrictArr = Array.from(cartFilterIds.restrict);
                restrict = restrict ? restrict.filter((id) => cartFilterIds.restrict!.has(id)) : cartRestrictArr;
            }
            if (cartFilterIds.exclude.size > 0) exclude = Array.from(cartFilterIds.exclude);
        }

        // facetParams()/parseIdsParam() (backend) tratam uma lista vazia como
        // "sem restrição" (parâmetro nem é enviado) — um id que nunca existe
        // de verdade força a API a bater zero produtos em vez de devolver o
        // catálogo inteiro quando o filtro não bate com nada no carrinho.
        if (restrict && restrict.length === 0) restrict = ["__none__"];

        return { restrictIds: restrict, excludeIds: exclude };
    }

    // O primeiro paint já vem pronto do server component (catalogo/page.tsx
    // chama /api/catalog-sections com os filtros da URL) — só refaz a busca
    // quando o usuário de fato muda um filtro depois de montado, com um
    // pequeno debounce pra não disparar uma requisição por tecla digitada.
    const isFirstRender = useRef(true);
    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        setLoadingSections(true);
        const timeout = setTimeout(async () => {
            try {
                const { restrictIds: rIds, excludeIds: eIds } = effectiveIds();
                const params = facetParams(filters, rIds, eIds);
                const response = await fetch(`/api/catalog-sections?${params.toString()}`);
                const result: CatalogSectionsResult = await response.json();
                setSectionsResult(result);
                setBottomGrid(deriveBottomGrid(result));
            } finally {
                setLoadingSections(false);
            }
        }, REFETCH_DEBOUNCE_MS);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters.term, filters.classificationId, filters.color, filters.size, cartFilterKey]);

    async function loadMore() {
        if (loadingMore || bottomGrid.pagination.page >= bottomGrid.pagination.totalPages) return;
        setLoadingMore(true);
        try {
            const { restrictIds: rIds, excludeIds: eIds } = effectiveIds();
            const params = facetParams(filters, rIds, eIds);
            if (bottomGrid.mode === "outros") params.set("excludeFeatured", "1");
            params.set("page", String(bottomGrid.pagination.page + 1));
            params.set("pageSize", String(bottomGrid.pagination.pageSize));
            const response = await fetch(`/api/catalog?${params.toString()}`);
            const page: CatalogPage = await response.json();
            setBottomGrid((prev) => ({ ...prev, items: [...prev.items, ...page.items], pagination: page.pagination }));
        } finally {
            setLoadingMore(false);
        }
    }

    const sentinelRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel || bottomGrid.pagination.page >= bottomGrid.pagination.totalPages) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting) loadMore();
            },
            { rootMargin: LOAD_MORE_ROOT_MARGIN },
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bottomGrid, filters, restrictIds, cartFilterKey, loadingMore]);

    // Ao subir na página, libera memória cortando o excesso de itens já
    // carregados no fim da grade de baixo — eles ficaram pra trás na
    // rolagem, então sumir com o DOM/imagens deles não é percebido. O
    // corte sempre fecha em um número inteiro de páginas, então a próxima
    // vez que o sentinela de baixo for atingido, loadMore() busca
    // exatamente a página seguinte, sem buraco nem duplicata.
    //
    // Crítico: só corta se o primeiro item a ser removido já está abaixo
    // da tela (fora da viewport). Cortar só pela contagem total, sem
    // olhar a posição real, apagava itens que o usuário ainda estava
    // olhando no meio da lista — a grade encolhia debaixo do scroll dele.
    const bottomGridContainerRef = useRef<HTMLDivElement>(null);
    const lastScrollYRef = useRef(0);
    useEffect(() => {
        lastScrollYRef.current = window.scrollY;
        let ticking = false;
        function handleScroll() {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => {
                const y = window.scrollY;
                const goingUp = y < lastScrollYRef.current - SCROLL_UP_THRESHOLD_PX;
                lastScrollYRef.current = y;
                ticking = false;
                if (!goingUp) return;
                setBottomGrid((prev) => {
                    const maxItems = WINDOW_PAGE_COUNT * prev.pagination.pageSize;
                    if (prev.items.length <= maxItems) return prev;
                    const keptPages = Math.floor(maxItems / prev.pagination.pageSize);
                    const keptCount = keptPages * prev.pagination.pageSize;

                    const container = bottomGridContainerRef.current;
                    const boundaryEl = container?.children[keptCount] as HTMLElement | undefined;
                    // Sem medir o DOM (grade ainda não montou) ou item logo
                    // acima/dentro da tela: não corta ainda, tenta de novo
                    // no próximo scroll. Margem de 200px pra folga contra
                    // scroll rápido.
                    if (!boundaryEl || boundaryEl.getBoundingClientRect().top < window.innerHeight + 200) return prev;

                    return {
                        ...prev,
                        items: prev.items.slice(0, keptCount),
                        pagination: { ...prev.pagination, page: keptPages },
                    };
                });
            });
        }
        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    const sections = sectionsResult.sections;
    const showSections = bottomGrid.showSections;
    const totalCount = sectionsResult.all.pagination.total;
    const isEmpty = !showSections && bottomGrid.pagination.total === 0;

    const [activeId, setActiveId] = useState(() => sections[0]?.id ?? "");
    const sectionRefs = useRef(new Map<string, HTMLElement>());
    const tabRefs = useRef(new Map<string, HTMLButtonElement>());
    const tabsRef = useRef<HTMLDivElement>(null);
    const [underline, setUnderline] = useState({ left: 0, width: 0 });

    // Aba visível "Outros produtos" (grade de baixo) entra na navegação de
    // abas como qualquer vitrine, só que renderizada com scroll infinito em
    // vez de mapear um array fixo.
    const tabs = showSections
        ? [...sections.map((s) => ({ id: s.id, label: s.label })), ...(bottomGrid.pagination.total > 0 ? [{ id: "outros", label: "Outros produtos" }] : [])]
        : [];

    // Se a aba selecionada não existe mais no recorte atual (filtro mudou,
    // a vitrine sumiu), cai pra primeira aba — calculado direto no render
    // em vez de um efeito só pra sincronizar estado (guia do React: ajustar
    // estado durante a renderização evita o "cascading render" de um
    // setState solto dentro de useEffect).
    const activeTabId = showSections && !tabs.some((t) => t.id === activeId) ? (tabs[0]?.id ?? "") : activeId;

    // Link direto pra uma vitrine (ex.: /catalogo#promocoes, campanha de
    // WhatsApp, ou /catalogo?destaque=X vindo do menu) — a rolagem nativa
    // do navegador pro #hash acontece antes do React montar as seções,
    // então repetimos manualmente assim que elas existem no DOM. Só na
    // carga inicial (hasSyncedHash trava depois de rodar uma vez — filtro
    // novo não deve arrancar a pessoa de onde ela rolou por conta).
    const hasSyncedHash = useRef(false);
    useEffect(() => {
        if (hasSyncedHash.current) return;
        const target = window.location.hash.slice(1) || searchParams.get("destaque") || "";
        if (!target) {
            hasSyncedHash.current = true;
            return;
        }
        const el = sectionRefs.current.get(target);
        if (el) {
            el.scrollIntoView({ block: "start" });
            setActiveId(target);
        }
        hasSyncedHash.current = true;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sections, bottomGrid.pagination.total]);

    // Aba ativa acompanha a rolagem (scrollspy): a "banda de detecção" fica
    // colada no topo (compensando topnav + barra de abas, ambas sticky) e
    // rasa embaixo, pra só contar a vitrine que está de fato começando a
    // aparecer, não qualquer uma parcialmente visível na tela toda.
    useEffect(() => {
        if (!showSections) return;
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries.filter((e) => e.isIntersecting);
                if (visible.length === 0) return;
                const topmost = visible.reduce((a, b) =>
                    a.boundingClientRect.top < b.boundingClientRect.top ? a : b,
                );
                const id = topmost.target.getAttribute("data-section-id");
                if (id) setActiveId(id);
            },
            { rootMargin: "-140px 0px -70% 0px", threshold: 0 },
        );
        tabs.forEach((t) => {
            const el = sectionRefs.current.get(t.id);
            if (el) observer.observe(el);
        });
        return () => observer.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showSections, sections, bottomGrid.pagination.total]);

    useLayoutEffect(() => {
        if (!showSections) return;
        function measure() {
            const btn = tabRefs.current.get(activeTabId);
            if (!btn) return;
            setUnderline({ left: btn.offsetLeft, width: btn.offsetWidth });
        }
        measure();
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
    }, [showSections, activeTabId, sections]);

    function goToSection(id: string) {
        setActiveId(id);
        sectionRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function clearFilters() {
        setFilters({ ...EMPTY_FILTERS });
    }

    function renderBottomGrid(prioritizeFirstRow: boolean) {
        return (
            <>
                <RowAutoplayGrid className={publicUi.catalogGrid} gridRef={bottomGridContainerRef}>
                    {bottomGrid.items.map((p, i) => (
                        <ProductCard key={p.id} product={p} index={i} priority={prioritizeFirstRow && i < FIRST_ROW_PRIORITY_COUNT} />
                    ))}
                    {loadingMore && Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={`more-${i}`} />)}
                </RowAutoplayGrid>
                {bottomGrid.pagination.page < bottomGrid.pagination.totalPages && <div ref={sentinelRef} aria-hidden="true" />}
            </>
        );
    }

    return (
        <>
            <main className={`${publicUi.container} ${publicUi.catalogMain}`}>
                <div className={publicUi.catalogLayout}>
                    <div className={publicUi.catalogSidebar}>
                        <Filters
                            options={filterOptions}
                            filters={filters}
                            onChange={setFilters}
                            onClear={clearFilters}
                        />
                    </div>
                    <div className={`${publicUi.catalogContent} ${loadingSections ? "opacity-60 transition-opacity" : "transition-opacity"}`}>
                        <div className={publicUi.catalogResults}>
                            <span>{totalCount} {totalCount === 1 ? "produto encontrado" : "produtos encontrados"}</span>
                            <span className="hidden text-xs font-medium tracking-[.08em] uppercase sm:inline">Catálogo</span>
                        </div>
                        {isEmpty ? (
                            <EmptyState
                                title="Nenhum produto encontrado"
                                description="Tente remover um filtro ou buscar por outro nome."
                                action={
                                    <Button type="button" variant="outline" onClick={clearFilters}>
                                        Limpar filtros
                                    </Button>
                                }
                            />
                        ) : showSections ? (
                            <>
                                <nav className={publicUi.catalogTabs} ref={tabsRef}>
                                    {tabs.map((t) => (
                                        <button
                                            key={t.id}
                                            type="button"
                                            ref={(el) => {
                                                if (el) tabRefs.current.set(t.id, el);
                                                else tabRefs.current.delete(t.id);
                                            }}
                                            className={`${publicUi.catalogTab} ${t.id === activeTabId ? publicUi.catalogTabActive : ""}`}
                                            onClick={() => goToSection(t.id)}
                                        >
                                            {t.label}
                                        </button>
                                    ))}
                                    <span
                                        className={publicUi.catalogTabUnderline}
                                        style={{ transform: `translateX(${underline.left}px)`, width: underline.width }}
                                    />
                                </nav>
                                {sections.map((s, sectionIndex) => (
                                    <section
                                        key={s.id}
                                        id={s.id}
                                        data-section-id={s.id}
                                        ref={(el) => {
                                            if (el) sectionRefs.current.set(s.id, el);
                                            else sectionRefs.current.delete(s.id);
                                        }}
                                        className={publicUi.catalogSection}
                                    >
                                        <h2 className={publicUi.catalogSectionTitle}>{s.label}</h2>
                                        <RowAutoplayGrid className={publicUi.catalogGrid}>
                                            {s.items.map((p, i) => (
                                                <ProductCard key={p.id} product={p} index={i} priority={sectionIndex === 0 && i < FIRST_ROW_PRIORITY_COUNT} />
                                            ))}
                                        </RowAutoplayGrid>
                                    </section>
                                ))}
                                {bottomGrid.pagination.total > 0 && (
                                    <section
                                        id="outros"
                                        data-section-id="outros"
                                        ref={(el) => {
                                            if (el) sectionRefs.current.set("outros", el);
                                            else sectionRefs.current.delete("outros");
                                        }}
                                        className={publicUi.catalogSection}
                                    >
                                        <h2 className={publicUi.catalogSectionTitle}>Outros produtos</h2>
                                        {renderBottomGrid(false)}
                                    </section>
                                )}
                            </>
                        ) : (
                            renderBottomGrid(true)
                        )}
                    </div>
                </div>
            </main>
        </>
    );
}
