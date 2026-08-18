'use client';
import { publicUi } from '@/lib/ui';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ProductDetailContent from './ProductDetailContent';
import SimilarProducts from './SimilarProducts';
import { useCart } from './CartProvider';
import { formatBRL } from '@/lib/format';
import type { Product } from '@/domain/products/types';

function MiniCartPreview() {
  const { cartCount, cartTotal, openCart } = useCart();
  return (
    <button className={publicUi.miniCart} onClick={openCart}>
      <span>🛍 {cartCount} peça(s)</span>
      <span>{formatBRL(cartTotal)}</span>
    </button>
  );
}

export default function ProductQuickView({
  product,
  onClose,
}: {
  product: Product | null;
  onClose: () => void;
}) {
  const isOpen = Boolean(product);
  const [similar, setSimilar] = useState<Product[]>([]);

  useEffect(() => {
    if (!product) {
      setSimilar([]);
      return;
    }
    let cancelled = false;
    fetch('/api/similar-products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: 'quickview', productIds: [product.id] }),
    })
      .then((r) => (r.ok ? r.json() : { products: [] }))
      .then((data) => {
        if (!cancelled) setSimilar(data.products || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [product]);

  return (
    <>
      <div className={[publicUi.overlay, isOpen ? 'block' : 'hidden'].join(' ')} onClick={onClose} />
      <aside className={[publicUi.drawerRight, isOpen ? 'translate-x-0' : ''].join(' ')}>
        {product && (
          <>
            <div className={publicUi.quickviewHeader}>
              <Link href={`/produto/${product.id}`} className="text-[13px] font-semibold text-brand-primary hover:underline">Abrir página do produto ↗</Link>
              <div className="flex items-center gap-3 [&>button]:cursor-pointer [&>button]:border-0 [&>button]:bg-transparent [&>button]:text-xl">
                <MiniCartPreview />
                <button aria-label="Fechar" onClick={onClose}>&times;</button>
              </div>
            </div>
            <div className={publicUi.quickviewBody}>
              <ProductDetailContent product={product} />
              <SimilarProducts products={similar} />
            </div>
          </>
        )}
      </aside>
    </>
  );
}
