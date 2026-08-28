"use client";
import { publicUi } from "@/lib/ui";
import { cn } from "@/lib/cn";

import type { CSSProperties } from "react";
import HomeBanner from "./HomeBanner";
import ProductCard from "./ProductCard";
import TenantLink from "./TenantLink";
import { useTenant } from "./TenantProvider";
import {
    canvasHeightFor,
    HOME_CANVAS_WIDTH,
    resolveBreakpointLayout,
    type HomeDevice,
} from "@/lib/homeLayout";
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

const DEVICES: HomeDevice[] = ["desktop", "tablet", "mobile"];
// Sufixo da CSS var por breakpoint (ver tailwind.css: .home-canvas / .home-item).
const VAR_SUFFIX: Record<HomeDevice, string> = { desktop: "d", tablet: "t", mobile: "m" };

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

    // Ordenado por `y` de desktop: é a ordem "de cima pra baixo" que a
    // loja montou. A ordem visual real em cada breakpoint vem da posição
    // dos blocos, não do JSON.
    const ordered = [...sections].sort((a, b) => (a.y || 0) - (b.y || 0));
    const firstBannerId = ordered.find((s) => s.type === "banner")?.id;

    // Larguras/alturas de canvas de referência de cada breakpoint. O CSS
    // escolhe qual par usar pela media query (ver tailwind.css).
    const canvasVars: Record<string, string | number> = {};
    for (const device of DEVICES) {
        const suffix = VAR_SUFFIX[device];
        canvasVars[`--dw-${suffix}`] = HOME_CANVAS_WIDTH[device];
        canvasVars[`--ch-${suffix}`] = canvasHeightFor(ordered, device);
    }

    return (
        <main className="home-canvas" style={canvasVars as CSSProperties}>
            {ordered.map((section) => {
                // Coordenadas dos 3 breakpoints como CSS vars — o CSS decide
                // qual conjunto aplica conforme a largura da janela.
                const posStyle: Record<string, string | number> = {};
                for (const device of DEVICES) {
                    const suffix = VAR_SUFFIX[device];
                    const layout = resolveBreakpointLayout(section, device);
                    posStyle[`--x-${suffix}`] = layout.x;
                    posStyle[`--y-${suffix}`] = layout.y;
                    posStyle[`--w-${suffix}`] = layout.width;
                    posStyle[`--h-${suffix}`] = layout.height;
                }

                const isFullBleed = section.type === "banner" && !!section.fullBleed;
                const itemClassName = cn(
                    "home-item",
                    isFullBleed && "home-item--full-bleed",
                    isFullBleed && section.fullHeight && "home-item--full-height",
                );

                if (section.type === "banner") {
                    return (
                        <div key={section.id} className={itemClassName} style={posStyle as CSSProperties}>
                            <div className="relative h-full w-full">
                                <HomeBanner
                                    banners={section.banners}
                                    fallbackTitle={tenant.name}
                                    headingLevel={section.id === firstBannerId ? "h1" : "h2"}
                                />
                                <HomeSectionCtaLink cta={section.cta} />
                            </div>
                        </div>
                    );
                }

                if (section.type === "product" && section.product) {
                    return (
                        <div key={section.id} className={itemClassName} style={posStyle as CSSProperties}>
                            <div className="relative h-full w-full">
                                <ProductCard product={section.product} />
                                <HomeSectionCtaLink cta={section.cta} />
                            </div>
                        </div>
                    );
                }

                return null;
            })}
        </main>
    );
}
