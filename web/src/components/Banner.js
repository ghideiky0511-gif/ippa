'use client';

import { CONFIG } from '@/lib/config';

export default function Banner() {
  if (!CONFIG.bannerVideoUrl) {
    return (
      <header className="banner no-media">
        <div className="banner-content">
          <h1>{CONFIG.storeName}</h1>
          <p>Catálogo — MVP de teste</p>
        </div>
      </header>
    );
  }
  return (
    <header className="banner">
      <video src={CONFIG.bannerVideoUrl} autoPlay loop muted playsInline className="banner-media" />
      <div className="banner-content">
        <h1>{CONFIG.storeName}</h1>
        <p>Catálogo — MVP de teste</p>
      </div>
    </header>
  );
}
