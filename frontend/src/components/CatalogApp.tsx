"use client";
import { publicUi } from "@/lib/ui";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Filters from "./Filters";
import ProductCard from "./ProductCard";
import ProductCardSkeleton from "./ProductCardSkeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { CONFIG } from "@/lib/config";
import { enableImageCache } from "@/lib/image-cache";
import { getProductsByIds } from "@/lib/catalogFacets";
import type { Highlight } from "@/domain/catalog/types";
import type { Product } from "@/domain/products/types";

export interface CatalogFilters {
    term: string;
    category: string;
    subcategory: string;
    color: string;
    size: string;
    destaque: string;
    publico: string;
}

export interface CatalogFilterOptions {
    categories: string[];
    colors: string[];
    sizes: string[];
}

interface CatalogSection {
    id: string;
    label: string;
    products: Product[];
}

export default function CatalogApp({
    initialProducts,
    filterOptions,
    initialHighlights,
}: {
    initialProducts: Product[];
    filterOptions: CatalogFilterOptions;
    initialHighlights: Highlight[];
}) {
    const searchParams = useSearchParams();
    const [filters, setFilters] = useState<CatalogFilters>(() => ({
        term: "",
        category: searchParams.get("categoria") || "",
        subcategory: searchParams.get("subcategoria") || "",
        color: "",
        size: "",
        destaque: searchParams.get("destaque") || "",
        publico: searchParams.get("publico") || "",
    }));
    // Vem pronto do server component (page.tsx busca /api/highlights junto com
    // o catálogo) — nada de refazer essa busca no cliente depois do primeiro
    // paint, senão a página monta em grade única e só vira abas um instante
    // depois, com o rótulo de cada vitrine "piscando" por cima do produto.
    const [highlights] = useState<Highlight[]>(initialHighlights);

    useEffect(() => {
        enableImageCache();
    }, []);

    const highlight = useMemo(
        () => highlights.find((h) => h.id === filters.destaque),
        [highlights, filters.destaque],
    );
    const audience = useMemo(
        () => CONFIG.home?.audiences?.find((a) => a.id === filters.publico),
        [filters.publico],
    );

    const filteredProducts = useMemo(() => {
        const term = filters.term.trim().toLowerCase();
        return initialProducts.filter((p) => {
            const matchesTerm =
                !term ||
                (p.name || "").toLowerCase().includes(term) ||
                (p.id || "").toLowerCase().includes(term);
            // Categorias "dobradas" no menu (ex.: BODY ALCA vira subcategoria de
            // BODY) têm produtos cujo campo `category` real é o nome dobrado — esse
            // produto some do filtro se a gente só comparar contra `subcategory`.
            const isFoldedMatch =
                !!filters.subcategory && p.category === filters.subcategory;
            const matchesCat =
                !filters.category ||
                p.category === filters.category ||
                isFoldedMatch;
            const matchesSubcat =
                !filters.subcategory ||
                p.subcategory === filters.subcategory ||
                isFoldedMatch;
            const matchesColor =
                !filters.color || (p.colors || []).includes(filters.color);
            const matchesSize =
                !filters.size || (p.sizes || []).includes(filters.size);
            // Destaque/público são tags de agrupamento (lista de IDs), não a
            // taxonomia categoria/subcategoria — destaques vêm de /api/highlights
            // (editável em /colecoes), públicos ainda em CONFIG.home.audiences.
            const matchesHighlight =
                !highlight || (highlight.productIds || []).includes(p.id);
            const matchesAudience =
                !audience ||
                !audience.productIds ||
                audience.productIds.includes(p.id);
            return (
                matchesTerm &&
                matchesCat &&
                matchesSubcat &&
                matchesColor &&
                matchesSize &&
                matchesHighlight &&
                matchesAudience
            );
        });
    }, [initialProducts, filters, highlight, audience]);

    // Catálogo em vitrines (não uma grade única): uma por Highlight
    // cadastrado (/colecoes na plataforma admin) mais uma vitrine fixa de
    // peças com desconto "peças específicas" ativo (/descontos), e por fim
    // uma vitrine de sobra ("Outros produtos") com tudo que não caiu em
    // nenhuma vitrine cadastrada — pra nenhuma peça filtrada sumir da
    // página só por não pertencer a um destaque/promoção. Cada vitrine
    // cruza os produtos já filtrados pela barra de filtros com o critério
    // da vitrine — uma peça pode aparecer em mais de uma (ex.: peça em
    // destaque que também está em promoção). Vitrine sem nenhuma peça
    // (filtro zerou ou highlight vazio) some da lista — não faz sentido
    // oferecer uma aba pra rolar até nada.
    const sections = useMemo<CatalogSection[]>(() => {
        const highlightSections = highlights.map(
            (h): CatalogSection => ({
                id: h.id,
                label: h.label,
                products: getProductsByIds(filteredProducts, h.productIds || []),
            }),
        );
        const promoSection: CatalogSection = {
            id: "promocoes",
            label: "Promoções",
            products: filteredProducts.filter((p) => !!p.activeDiscount),
        };
        const featuredIds = new Set(
            [...highlightSections, promoSection].flatMap((s) => s.products.map((p) => p.id)),
        );
        const othersSection: CatalogSection = {
            id: "outros",
            label: "Outros produtos",
            products: filteredProducts.filter((p) => !featuredIds.has(p.id)),
        };
        return [...highlightSections, promoSection, othersSection].filter(
            (s) => s.products.length > 0,
        );
    }, [filteredProducts, highlights]);

    // Só 2+ vitrines com produto justificam abas — com 0 ou 1, cai de volta
    // na grade única (mesmo conteúdo, sem abas à toa).
    const showSections = sections.length > 1;

    const [activeId, setActiveId] = useState("");
    const sectionRefs = useRef(new Map<string, HTMLElement>());
    const tabRefs = useRef(new Map<string, HTMLButtonElement>());
    const tabsRef = useRef<HTMLDivElement>(null);
    const [underline, setUnderline] = useState({ left: 0, width: 0 });

    useEffect(() => {
        if (!showSections) return;
        if (!sections.some((s) => s.id === activeId)) setActiveId(sections[0].id);
    }, [showSections, sections, activeId]);

    // Link direto pra uma vitrine (ex.: /catalogo#promocoes, campanha de
    // WhatsApp) — a rolagem nativa do navegador pro #hash acontece antes do
    // React montar as seções, então repetimos manualmente assim que elas
    // existem no DOM. Só na carga inicial (hasSyncedHash trava depois de
    // rodar uma vez — filtro novo não deve arrancar a pessoa de onde ela
    // rolou por conta).
    const hasSyncedHash = useRef(false);
    useEffect(() => {
        if (hasSyncedHash.current) return;
        const hash = window.location.hash.slice(1);
        if (!hash) {
            hasSyncedHash.current = true;
            return;
        }
        const el = sectionRefs.current.get(hash);
        if (el) {
            el.scrollIntoView({ block: "start" });
            setActiveId(hash);
        }
        hasSyncedHash.current = true;
    }, [sections]);

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
        sections.forEach((s) => {
            const el = sectionRefs.current.get(s.id);
            if (el) observer.observe(el);
        });
        return () => observer.disconnect();
    }, [showSections, sections]);

    useLayoutEffect(() => {
        if (!showSections) return;
        function measure() {
            const btn = tabRefs.current.get(activeId);
            if (!btn) return;
            setUnderline({ left: btn.offsetLeft, width: btn.offsetWidth });
        }
        measure();
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
    }, [showSections, activeId, sections]);

    function goToSection(id: string) {
        setActiveId(id);
        sectionRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
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
                            onClear={() =>
                                setFilters({
                                    term: "",
                                    category: "",
                                    subcategory: "",
                                    color: "",
                                    size: "",
                                    destaque: "",
                                    publico: "",
                                })
                            }
                        />
                    </div>
                    <div className={publicUi.catalogContent}>
                        {initialProducts.length === 0 ? (
                            <div className={publicUi.catalogGrid}>
                                {Array.from({ length: 8 }).map((_, i) => (
                                    <ProductCardSkeleton key={i} />
                                ))}
                            </div>
                        ) : (
                            <>
                                <div className={publicUi.catalogResults}>
                                    <span>{filteredProducts.length}{" "}
                                        {filteredProducts.length === 1
                                            ? "produto encontrado"
                                            : "produtos encontrados"}</span>
                                    <span className="hidden text-xs font-medium tracking-[.08em] uppercase sm:inline">Catálogo</span>
                                </div>
                                {filteredProducts.length === 0 ? (
                                    <EmptyState
                                        title="Nenhum produto encontrado"
                                        description="Tente remover um filtro ou buscar por outro nome."
                                        action={
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={() =>
                                                    setFilters({
                                                        term: "",
                                                        category: "",
                                                        subcategory: "",
                                                        color: "",
                                                        size: "",
                                                        destaque: "",
                                                        publico: "",
                                                    })
                                                }
                                            >
                                                Limpar filtros
                                            </Button>
                                        }
                                    />
                                ) : showSections ? (
                                    <>
                                        <nav className={publicUi.catalogTabs} ref={tabsRef}>
                                            {sections.map((s) => (
                                                <button
                                                    key={s.id}
                                                    type="button"
                                                    ref={(el) => {
                                                        if (el) tabRefs.current.set(s.id, el);
                                                        else tabRefs.current.delete(s.id);
                                                    }}
                                                    className={`${publicUi.catalogTab} ${s.id === activeId ? publicUi.catalogTabActive : ""}`}
                                                    onClick={() => goToSection(s.id)}
                                                >
                                                    {s.label}
                                                </button>
                                            ))}
                                            <span
                                                className={publicUi.catalogTabUnderline}
                                                style={{ transform: `translateX(${underline.left}px)`, width: underline.width }}
                                            />
                                        </nav>
                                        {sections.map((s) => (
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
                                                <div className={publicUi.catalogGrid}>
                                                    {s.products.map((p) => (
                                                        <ProductCard key={p.id} product={p} />
                                                    ))}
                                                </div>
                                            </section>
                                        ))}
                                    </>
                                ) : (
                                    <div className={publicUi.catalogGrid}>
                                        {filteredProducts.map((p) => (
                                            <ProductCard key={p.id} product={p} />
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </main>
        </>
    );
}
