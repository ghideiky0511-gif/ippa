'use client';

import { useState, type ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { Skeleton } from '@/components/ui/skeleton';

const FALLBACK_IMAGE = 'https://via.placeholder.com/500x620?text=Sem+imagem';

type ProductImageProps = Omit<ComponentProps<'img'>, 'src'> & {
  src?: string | null;
};

/**
 * Imagem de produto sempre limitada pelo espaço definido pelo componente pai.
 * Cada contexto escolhe apenas o seu tamanho e proporção via `className`,
 * aplicada aqui no wrapper — a imagem em si só preenche esse espaço. Isso
 * dá um lugar único pra mostrar um skeleton enquanto a imagem (que vem de
 * URL externa e variável, sem controle de tamanho) ainda não carregou, em
 * vez de cada tela precisar lidar com isso na mão.
 */
export default function ProductImage({ src, alt, className, onLoad, onError, ...props }: ProductImageProps) {
  const [loaded, setLoaded] = useState(false);
  return (
    <span className={cn('relative block max-w-full overflow-hidden', className)}>
      {!loaded && <Skeleton className="absolute inset-0 size-full rounded-none" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        loading="lazy"
        decoding="async"
        {...props}
        src={src || FALLBACK_IMAGE}
        alt={alt}
        onLoad={(e) => {
          setLoaded(true);
          onLoad?.(e);
        }}
        onError={(e) => {
          // Sem isso, uma URL quebrada deixaria o skeleton pulsando pra sempre.
          setLoaded(true);
          onError?.(e);
        }}
        className={cn('block size-full object-cover opacity-0 transition-opacity duration-300', loaded && 'opacity-100')}
      />
    </span>
  );
}
