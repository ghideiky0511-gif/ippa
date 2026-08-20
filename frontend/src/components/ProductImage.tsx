import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

const FALLBACK_IMAGE = 'https://via.placeholder.com/500x620?text=Sem+imagem';

type ProductImageProps = Omit<ComponentProps<'img'>, 'src'> & {
  src?: string | null;
};

/**
 * Imagem de produto sempre limitada pelo espaço definido pelo componente pai.
 * Cada contexto escolhe apenas o seu tamanho e proporção via `className`.
 */
export default function ProductImage({ src, alt, className, ...props }: ProductImageProps) {
  return (
    // URLs de produtos sÃ£o externas e variÃ¡veis; o Service Worker cuida do cache.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      src={src || FALLBACK_IMAGE}
      alt={alt}
      className={cn('block max-w-full object-cover', className)}
    />
  );
}
