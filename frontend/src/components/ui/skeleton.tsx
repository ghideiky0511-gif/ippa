import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('animate-pulse rounded-control bg-brand-background', className)} {...props} />;
}

/**
 * Lista genérica de blocos-esqueleto pra qualquer tela que ainda não montou
 * um layout próprio de skeleton (ex: cards, linhas de lista). Pra tabelas
 * do workspace, prefira o `loading` do ResponsiveDataTable — ele já sabe
 * desenhar cabeçalho + linhas reais.
 */
export function SkeletonList({
  count = 3,
  className,
  itemClassName,
}: {
  count?: number;
  className?: string;
  itemClassName?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-3', className)} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={cn('h-20 w-full', itemClassName)} />
      ))}
    </div>
  );
}
