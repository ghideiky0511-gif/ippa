"use client";
import { publicUi } from "@/lib/ui";

import type { CSSProperties } from "react";
import HomeBanner from "./HomeBanner";
import ProductCard from "./ProductCard";
import TenantLink from "./TenantLink";
import { useTenant } from "./TenantProvider";
import type { HomeSectionCta, ResolvedHomeSection } from "@/domain/catalog/types";

// Hiperlink que a loja configura por bloco no editor da home
// (ver RightPanel.tsx). Ancorado no canto inferior direito do bloco.
// `href` começando com "/" é uma rota da própria loja (TenantLink
// prefixa o slug do tenant); "https://…" abre em nova aba.
function HomeSectionCtaLink({ cta }: { cta?: HomeSectionCta }) {
    if (!cta?.enabled || !cta.label.trim() || !cta.href.trim()) return null;

    const label = cta.label.trim();
    const href = cta.href.trim();
    const className =
        "absolute bottom-3 right-3 z-10 inline-flex max-w-[calc(100%-1.5rem)] items-center gap-1 rounded-full bg-black/70 px-4 py-2 text-sm font-semibold text-white no-underline shadow-lg backdrop-blur-sm transition-colors hover:bg-black/85 max-sm:bottom-2 max-sm:right-2";
    const content = (
        <>
            <span className="truncate">{label}</span>
            <span aria-hidden="true">→</span>
        </>
    );

    if (/^https?:\/\//i.test(href)) {
        return (
            <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
                {content}
            </a>
        );
    }

    return (
        <TenantLink href={href} className={className}>
            {content}
        </TenantLink>
    );
}

// Mesmos padrões de admin/src/lib/blockRegistry.js — usados só quando um
// bloco antigo/manual não trouxer x/y/width/height.
const DEFAULT_WIDTH = 280;
const DEFAULT_HEIGHT = 320;
const BOTTOM_PADDING = 60;

export default function HomeApp({
    sections,
}: {
    sections: ResolvedHomeSection[];
}) {
    const { tenant } = useTenant();
    if (!sections || sections.length === 0) {
        return (
            <header className={publicUi.homeFallback}>
                <div className="">
                    <h1>{tenant.name}</h1>
                </div>
            </header>
        );
    }

    // Ordenado por `y`: é a ordem que o celular usa pra empilhar (ver media
    // query em globals.css, que ignora x/y/width e vira um fluxo normal) —
    // sem isso, a ordem visual no celular dependeria da ordem do JSON, não
    // de onde o bloco realmente está no canvas.
    const ordered = [...sections].sort((a, b) => (a.y || 0) - (b.y || 0));
    const firstBannerId = ordered.find((s) => s.type === "banner")?.id;
    const canvasHeight = Math.max(
        400,
        ...ordered.map(
            (s) => (s.y || 0) + (s.height || DEFAULT_HEIGHT) + BOTTOM_PADDING,
        ),
    );

    return (
        <>
            <main
                className={publicUi.homeSections}
                style={
                    { "--canvas-height": `${canvasHeight}px` } as CSSProperties
                }
            >
                {ordered.map((section) => {
                    // CSS vars em vez de left/top/width direto no style: assim a media
                    // query no globals.css (celular = sempre fluxo normal) consegue
                    // vencer a cascata sem precisar de !important.
                    const posStyle = {
                        "--x": `${section.x || 0}px`,
                        "--y": `${section.y || 0}px`,
                        "--w": `${section.width || DEFAULT_WIDTH}px`,
                        "--h": `${section.height || DEFAULT_HEIGHT}px`,
                    } as CSSProperties;

                    if (section.type === "banner") {
                        return (
                            <div
                                key={section.id}
                                className={publicUi.homeSectionItem}
                                style={posStyle}
                            >
                                <div className="relative h-full w-full max-sm:h-auto">
                                    <HomeBanner
                                        banners={section.banners}
                                        fallbackTitle={tenant.name}
                                        headingLevel={
                                            section.id === firstBannerId
                                                ? "h1"
                                                : "h2"
                                        }
                                        height={section.height}
                                        width={section.width}
                                    />
                                    <HomeSectionCtaLink cta={section.cta} />
                                </div>
                            </div>
                        );
                    }

                    if (section.type === "product" && section.product) {
                        return (
                            <div
                                key={section.id}
                                className={publicUi.homeSectionItem}
                                style={posStyle}
                            >
                                <div className="relative h-full w-full max-sm:h-auto">
                                    <ProductCard product={section.product} />
                                    <HomeSectionCtaLink cta={section.cta} />
                                </div>
                            </div>
                        );
                    }

                    return null;
                })}
            </main>
        </>
    );
}
