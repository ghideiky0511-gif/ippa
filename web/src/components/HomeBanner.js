'use client';

import { useState } from 'react';
import { CONFIG } from '@/lib/config';

export default function HomeBanner() {
  const banners = CONFIG.home?.banners || [];
  const [index, setIndex] = useState(0);

  if (banners.length === 0) {
    return (
      <header className="banner no-media">
        <div className="banner-content">
          <h1>{CONFIG.storeName}</h1>
          <p>Catálogo — MVP de teste</p>
        </div>
      </header>
    );
  }

  const current = banners[index];

  function prev() {
    setIndex((i) => (i - 1 + banners.length) % banners.length);
  }

  function next() {
    setIndex((i) => (i + 1) % banners.length);
  }

  return (
    <header className="banner home-banner">
      {current.type === 'video' ? (
        <video src={current.mediaUrl} autoPlay loop muted playsInline className="banner-media" />
      ) : (
        <img src={current.mediaUrl} alt={current.title || ''} className="banner-media" />
      )}
      <div className="banner-content">
        <h1>{current.title || CONFIG.storeName}</h1>
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
