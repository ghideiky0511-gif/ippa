'use client';

import { useEffect } from 'react';
import ProductDetailContent from './ProductDetailContent';
import { useQuickView } from './QuickViewProvider';
import type { Product } from '@/domain/products/types';

/** Marca o destino da transição somente quando a página foi aberta pelo painel. */
export default function ProductPageDetail({ product }: { product: Product }) {
  const { transitioningProductId, completeProductPageTransition } = useQuickView();
  const isTransitionDestination = transitioningProductId === product.id;

  useEffect(() => {
    if (!isTransitionDestination) return;
    const timeout = window.setTimeout(() => completeProductPageTransition(product.id), 700);
    return () => window.clearTimeout(timeout);
  }, [completeProductPageTransition, isTransitionDestination, product.id]);

  return (
    <ProductDetailContent
      product={product}
      onLayoutAnimationComplete={
        isTransitionDestination ? () => completeProductPageTransition(product.id) : undefined
      }
    />
  );
}
