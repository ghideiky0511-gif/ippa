'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { COLOR_MAP } from '@/lib/config';
import { publicUi } from '@/lib/ui';
import type { Product } from '@/domain/products/types';
import ProductImage from './ProductImage';

const MAX_COLOR_DOTS = 6;

interface CatalogProductCardProps {
  product: Product;
  onOpen: () => void;
  /** Conteúdo específico do contexto, como o botão do carrinho. */
  imageAction?: ReactNode;
  /** Link público ou botão interno para abrir o produto. */
  title: ReactNode;
  price: ReactNode;
}

/** A apresentação do produto é única; carrinho e talão injetam apenas suas ações. */
export default function CatalogProductCard({ product, onOpen, imageAction, title, price }: CatalogProductCardProps) {
  const colors = product.colors || [];
  const shownColors = colors.slice(0, MAX_COLOR_DOTS);
  const extraColors = colors.length - shownColors.length;

  // Um card de vídeo decodificando em segundo plano pesa muito mais que uma
  // imagem parada — com dezenas deles numa vitrine, "autoPlay" em todos ao
  // mesmo tempo é o maior consumidor de memória/CPU da grade, de longe.
  // Só toca quando o card realmente está visível; `preload="metadata"`
  // evita baixar o vídeo inteiro antes disso.
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.25 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  return (
    <Card className={publicUi.catalogCard}>
      <div className={publicUi.catalogCardMedia}>
        <button type="button" className="block size-full cursor-pointer border-0 bg-transparent p-0" aria-label={`Ver cores e tamanhos de ${product.name}`} onClick={onOpen}>
          {product.videoUrl ? (
            <video ref={videoRef} className="block size-full bg-brand-background object-cover transition-transform duration-[250ms] group-hover:scale-[1.04]" src={product.videoUrl} preload="metadata" loop muted playsInline disablePictureInPicture />
          ) : (
            <ProductImage src={product.image} alt={product.name} className="size-full bg-brand-background transition-transform duration-[250ms] group-hover:scale-[1.04]" />
          )}
        </button>
        {imageAction}
        {shownColors.length > 0 && (
          <div className={`pointer-events-none absolute bottom-3 left-2.5 hidden flex-wrap items-center gap-1.5 rounded-full bg-white/90 px-2 py-1.5 backdrop-blur-sm group-hover:flex sm:flex ${imageAction ? 'right-14' : 'right-2.5'}`}>
            {shownColors.map((color) => <span key={color} className="inline-block size-3.5 shrink-0 rounded-full border border-black/15" style={{ background: COLOR_MAP[color] || '#ccc' }} title={color} />)}
            {extraColors > 0 && <span className="text-[11px] text-brand-muted">+{extraColors}</span>}
          </div>
        )}
      </div>
      <div className={publicUi.catalogCardContent}>
        {product.category && <Badge>{product.category}</Badge>}
        <h3 className="min-h-[2.7em] text-[15px] font-semibold leading-[1.35]">{title}</h3>
        {product.referenceId && <div className="-mt-1 text-[11px] text-brand-muted">{product.referenceId}</div>}
        {price}
      </div>
    </Card>
  );
}
