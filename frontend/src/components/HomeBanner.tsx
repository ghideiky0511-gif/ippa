'use client';
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { publicUi } from '@/lib/ui';
import type { Banner } from '@/domain/catalog/types';

// `headingLevel` existe porque HomeApp pode renderizar vários banners na
// mesma página (um por section) — só o primeiro deve virar <h1> (uma página
// só pode ter um), os demais viram <h2> pra não quebrar a hierarquia.
//
// O tamanho do banner é 100% do bloco `.home-item` que o envolve — quem
// decide largura/altura (e o modo largura-total/hero) é o canvas
// responsivo da home (ver HomeApp.tsx + tailwind.css).
export default function HomeBanner({
  banners,
  fallbackTitle,
  headingLevel = 'h2',
}: {
  banners: Banner[];
  fallbackTitle: string;
  headingLevel?: 'h1' | 'h2';
}) {
  const [index, setIndex] = useState(0);

  if (!banners || banners.length === 0) return null;

  const current = banners[index];
  const Heading = headingLevel;

  function prev() {
    setIndex((i) => (i - 1 + banners.length) % banners.length);
  }

  function next() {
    setIndex((i) => (i + 1) % banners.length);
  }

  return (
    <header className="relative h-full w-full overflow-hidden bg-linear-to-br from-brand-primary to-brand-primary-dark text-white">
      {current.type === 'video' ? (
        <video src={current.mediaUrl} autoPlay loop muted playsInline className="block size-full object-cover opacity-85" />
      ) : (
        // Mídia de banner é URL externa configurável — next/image exigiria
        // liberar cada origem no build.
        // eslint-disable-next-line @next/next/no-img-element
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
