'use client';

import { useState, type ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { Skeleton } from '@/components/ui/skeleton';

// SVG local (data URI) em vez de um serviço externo (via.placeholder.com,
// que já teve quedas prolongadas) — precisa estar sempre disponível, já que
// é o próprio fallback exibido quando a imagem real falha.
const FALLBACK_IMAGE =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="620" viewBox="0 0 500 620">' +
      '<rect width="500" height="620" fill="#e8e2df"/>' +
      '<text x="250" y="310" font-family="sans-serif" font-size="28" fill="#9c8f89" text-anchor="middle" dominant-baseline="middle">Sem imagem</text>' +
      '</svg>',
  );

type ProductImageProps = Omit<ComponentProps<'img'>, 'src'> & {
  src?: string | null;
  /** Imagem já visível no primeiro paint (ex.: primeira fileira da grade) — carrega eager/high em vez de lazy, pra não atrasar o LCP. */
  priority?: boolean;
};

/**
 * Imagem de produto sempre limitada pelo espaço definido pelo componente pai.
 * Cada contexto escolhe apenas o seu tamanho e proporção via `className`,
 * aplicada aqui no wrapper — a imagem em si só preenche esse espaço. Isso
 * dá um lugar único pra mostrar um skeleton enquanto a imagem (que vem de
 * URL externa e variável, sem controle de tamanho) ainda não carregou, em
 * vez de cada tela precisar lidar com isso na mão.
 */
export default function ProductImage({ src, alt, className, priority, onLoad, onError, ...props }: ProductImageProps) {
  const [imageState, setImageState] = useState({ src, loaded: false, failed: false });
  // Comparar a URL no render reseta o estado de forma síncrona quando a
  // imagem muda. Um useEffect aqui podia executar depois do onLoad de uma
  // imagem já em cache e voltar `loaded` para false.
  const isCurrentSource = imageState.src === src;
  const loaded = isCurrentSource && imageState.loaded;
  const failed = isCurrentSource && imageState.failed;

  return (
    <span className={cn('relative block max-w-full overflow-hidden', className)}>
      {!loaded && <Skeleton className="absolute inset-0 size-full rounded-none" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        {...props}
        src={failed || !src ? FALLBACK_IMAGE : src}
        alt={alt}
        onLoad={(e) => {
          setImageState((current) => ({
            src,
            loaded: true,
            failed: current.src === src && current.failed,
          }));
          onLoad?.(e);
        }}
        onError={(e) => {
          // A requisição pode ter vindo 200 e mesmo assim falhar aqui (corpo
          // vazio/corrompido, Content-Type errado etc.) — sem isso, ficava
          // preso no ícone de imagem quebrada do navegador em vez de cair
          // pro fallback local.
          setImageState({ src, loaded: true, failed: true });
          onError?.(e);
        }}
        className={cn('block size-full object-cover opacity-0 transition-opacity duration-300', loaded && 'opacity-100')}
      />
    </span>
  );
}
