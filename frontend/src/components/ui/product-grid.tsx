'use client';
import type { ReactNode, RefObject } from 'react';
import { RowAutoplayGrid } from '@/components/RowAutoplayGrid';
import { publicUi } from '@/lib/ui';

export type ProductGridDensity = 'catalog' | 'compact';

export type ProductGridProps = {
  children: ReactNode;
  density?: ProductGridDensity;
  className?: string;
  gridRef?: RefObject<HTMLDivElement | null>;
  autoplayRows?: boolean;
};

const DENSITY_CLASS: Record<ProductGridDensity, string> = {
  catalog: publicUi.catalogGrid,
  compact: publicUi.catalogGridCompact,
};

// Grade de produtos unificada — sempre revezando vídeo por fileira via
// RowAutoplayGrid (autoplayRows=false só existe pra um contexto sem vídeo
// querer pular o ResizeObserver). `density` escolhe o token de colunas/gap;
// `className` é apensado, não substitui, então um call site pode ajustar
// margens sem perder o preset.
export function ProductGrid({ children, density = 'catalog', className, gridRef, autoplayRows = true }: ProductGridProps) {
  const gridClassName = [DENSITY_CLASS[density], className].filter(Boolean).join(' ');

  if (!autoplayRows) {
    return (
      <div className={gridClassName} ref={gridRef}>
        {children}
      </div>
    );
  }

  return (
    <RowAutoplayGrid className={gridClassName} gridRef={gridRef}>
      {children}
    </RowAutoplayGrid>
  );
}
