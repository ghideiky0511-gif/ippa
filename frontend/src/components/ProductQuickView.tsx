'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ProductDetailContent from './ProductDetailContent';
import SimilarProducts from './SimilarProducts';
import { useCart } from './CartProvider';
import { formatBRL } from '@/lib/format';
import type { Product } from '@/lib/types';

function MiniCartPreview() {
  const { cartCount, cartTotal, openCart } = useCart();
  return (
    <button className="minicart-float" onClick={openCart}>
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
      <div className={'quickview-overlay' + (isOpen ? ' open' : '')} onClick={onClose} />
      <aside className={'quickview-drawer' + (isOpen ? ' open' : '')}>
        {product && (
          <>
            <div className="quickview-header">
              <Link href={`/produto/${product.id}`} className="quickview-fulllink">Abrir página do produto ↗</Link>
              <div className="quickview-header-actions">
                <MiniCartPreview />
                <button aria-label="Fechar" onClick={onClose}>&times;</button>
              </div>
            </div>
            <div className="quickview-body">
              <ProductDetailContent product={product} />
              <SimilarProducts products={similar} />
            </div>
          </>
        )}
      </aside>
    </>
  );
}
