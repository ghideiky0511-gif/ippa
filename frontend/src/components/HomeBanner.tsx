'use client';

import { useState, type CSSProperties } from 'react';
import type { Banner } from '@/domain/catalog/types';

// `headingLevel` existe porque HomeApp pode renderizar vários banners na
// mesma página (um por section) — só o primeiro deve virar <h1> (uma página
// só pode ter um), os demais viram <h2> pra não quebrar a hierarquia.
export default function HomeBanner({
  banners,
  fallbackTitle,
  headingLevel = 'h2',
  height,
  width,
}: {
  banners: Banner[];
  fallbackTitle: string;
  headingLevel?: 'h1' | 'h2';
  height?: number;
  width?: number;
}) {
  const [index, setIndex] = useState(0);

  if (!banners || banners.length === 0) return null;

  const current = banners[index];
  const Heading = headingLevel;
  // CSS vars em vez de height direto: no desktop o canvas do admin manda
  // (--banner-h), mas essa altura em px foi pensada pra largura do canvas
  // (1200px) — no celular, onde o bloco vira largura 100%, aplicar o mesmo
  // px faz a imagem (object-fit:cover) esticar/cortar fora de proporção.
  // --banner-ratio guarda a proporção original (width/height do bloco) pra
  // o media query em globals.css usar aspect-ratio no lugar da altura fixa.
  const style = height
    ? ({
        '--banner-h': `${height}px`,
        ...(width ? { '--banner-ratio': `${width} / ${height}` } : {}),
      } as CSSProperties)
    : undefined;

  function prev() {
    setIndex((i) => (i - 1 + banners.length) % banners.length);
  }

  function next() {
    setIndex((i) => (i + 1) % banners.length);
  }

  return (
    <header className="banner home-banner" style={style}>
      {current.type === 'video' ? (
        <video src={current.mediaUrl} autoPlay loop muted playsInline className="banner-media" />
      ) : (
        <img src={current.mediaUrl} alt={current.title || ''} className="banner-media" />
      )}
      <div className="banner-content">
        <Heading>{current.title || fallbackTitle}</Heading>
        {current.subtitle && <p>{current.subtitle}</p>}
      </div>

      {banners.length > 1 && (
        <>
          <button className="home-banner-arrow prev" aria-label="Banner anterior" onClick={prev}>‹</button>
          <button className="home-banner-arrow next" aria-label="Próximo banner" onClick={next}>›</button>
          <div className="home-banner-dots">
            {banners.map((b, i) => (
              <button
                key={b.id}
                className={'home-banner-dot' + (i === index ? ' active' : '')}
                aria-label={`Ir para o banner ${i + 1}`}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
        </>
      )}
    </header>
  );
}
