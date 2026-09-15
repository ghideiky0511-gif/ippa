'use client';

import ProductDetailContent from './ProductDetailContent';
import { useQuickView } from './QuickViewProvider';
import type { Product } from '@/domain/products/types';

// Keep the Quick View source mounted until this destination reports that its
// shared layout animation is complete. See docs/product-detail-motion.md.

/** Marca o destino da transição somente quando a página foi aberta pelo painel. */
export default function ProductPageDetail({ product }: { product: Product }) {
  const { transitioningProductId, completeProductPageTransition } = useQuickView();
  const isTransitionDestination = transitioningProductId === product.id;

  return (
    <ProductDetailContent
      product={product}
      onLayoutAnimationComplete={
        isTransitionDestination ? () => completeProductPageTransition(product.id) : undefined
      }
    />
  );
}
