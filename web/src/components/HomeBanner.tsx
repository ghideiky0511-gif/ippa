'use client';

import { useState } from 'react';
import type { Banner } from '@/lib/types';

// `headingLevel` existe porque HomeApp pode renderizar vários banners na
// mesma página (um por section) — só o primeiro deve virar <h1> (uma página
// só pode ter um), os demais viram <h2> pra não quebrar a hierarquia.
export default function HomeBanner({
  banners,
  fallbackTitle,
  headingLevel = 'h2',
  height,
}: {
  banners: Banner[];
  fallbackTitle: string;
  headingLevel?: 'h1' | 'h2';
  height?: number;
}) {
  const [index, setIndex] = useState(0);

  if (!banners || banners.length === 0) return null;

  const current = banners[index];
  const Heading = headingLevel;
  const style = height ? { height } : undefined;

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
