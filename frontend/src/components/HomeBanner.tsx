'use client';
import { useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { publicUi } from '@/lib/ui';
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
    <header className="relative [height:var(--banner-h,320px)] overflow-hidden bg-linear-to-br from-brand-primary to-brand-primary-dark text-white max-sm:h-auto max-sm:[aspect-ratio:var(--banner-ratio,4/5)]" style={style}>
      {current.type === 'video' ? (
        <video src={current.mediaUrl} autoPlay loop muted playsInline className="block size-full object-cover opacity-85" />
      ) : (
        <img src={current.mediaUrl} alt={current.title || ''} className="block size-full object-cover opacity-85" />
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
        <Heading className="mb-1.5 font-editorial text-[clamp(30px,4vw,48px)] leading-[.9] font-semibold tracking-[-0.025em]">{current.title || fallbackTitle}</Heading>
        {current.subtitle && <p className="opacity-90">{current.subtitle}</p>}
      </div>

      {banners.length > 1 && (
        <>
          <button className={`${publicUi.carouselControl} absolute top-1/2 left-3.5 -translate-y-1/2`} aria-label="Banner anterior" onClick={prev}><ChevronLeft className="size-5" aria-hidden="true" /></button>
          <button className={`${publicUi.carouselControl} absolute top-1/2 right-3.5 -translate-y-1/2`} aria-label="Próximo banner" onClick={next}><ChevronRight className="size-5" aria-hidden="true" /></button>
          <div className="absolute right-0 bottom-3.5 left-0 flex justify-center gap-2">
            {banners.map((b, i) => (
              <button
                key={b.id}
                className={`h-2 cursor-pointer rounded-full border-0 p-0 transition-[width,background-color] duration-300 ${i === index ? 'w-6 bg-white' : 'w-2 bg-white/50 hover:bg-white/75'}`}
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
