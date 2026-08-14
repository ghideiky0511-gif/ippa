'use client';

import type { CSSProperties } from 'react';
import HomeBanner from './HomeBanner';
import ProductCard from './ProductCard';
import { CONFIG } from '@/lib/config';
import type { ResolvedHomeSection } from '@/lib/types';

// Mesmos padrões de admin/src/lib/blockRegistry.js — usados só quando um
// bloco antigo/manual não trouxer x/y/width/height.
const DEFAULT_WIDTH = 280;
const DEFAULT_HEIGHT = 320;
const BOTTOM_PADDING = 60;

export default function HomeApp({ sections }: { sections: ResolvedHomeSection[] }) {
  if (!sections || sections.length === 0) {
    return (
      <header className="banner no-media">
        <div className="banner-content">
          <h1>{CONFIG.storeName}</h1>
          <p>Catálogo — MVP de teste</p>
        </div>
      </header>
    );
  }

  // Ordenado por `y`: é a ordem que o celular usa pra empilhar (ver media
  // query em globals.css, que ignora x/y/width e vira um fluxo normal) —
  // sem isso, a ordem visual no celular dependeria da ordem do JSON, não
  // de onde o bloco realmente está no canvas.
  const ordered = [...sections].sort((a, b) => (a.y || 0) - (b.y || 0));
  const firstBannerId = ordered.find((s) => s.type === 'banner')?.id;
  const canvasHeight = Math.max(
    400,
    ...ordered.map((s) => (s.y || 0) + (s.height || DEFAULT_HEIGHT) + BOTTOM_PADDING)
  );

  return (
    <>
      <main className="home-sections" style={{ '--canvas-height': `${canvasHeight}px` } as CSSProperties}>
        {ordered.map((section) => {
          // CSS vars em vez de left/top/width direto no style: assim a media
          // query no globals.css (celular = sempre fluxo normal) consegue
          // vencer a cascata sem precisar de !important.
          const posStyle = {
            '--x': `${section.x || 0}px`,
            '--y': `${section.y || 0}px`,
            '--w': `${section.width || DEFAULT_WIDTH}px`,
            '--h': `${section.height || DEFAULT_HEIGHT}px`,
          } as CSSProperties;

          if (section.type === 'banner') {
            return (
              <div key={section.id} className="home-section-item" style={posStyle}>
                <HomeBanner
                  banners={section.banners}
                  fallbackTitle={CONFIG.storeName}
                  headingLevel={section.id === firstBannerId ? 'h1' : 'h2'}
                  height={section.height}
                  width={section.width}
                />
              </div>
            );
          }

          if (section.type === 'product' && section.product) {
            return (
              <div key={section.id} className="home-section-item" style={posStyle}>
                <ProductCard product={section.product} />
              </div>
            );
          }

          return null;
        })}
      </main>

      <footer>MVP de catálogo — dados de teste vindos do feed público da Fashion Girl Atacado.</footer>
    </>
  );
}
