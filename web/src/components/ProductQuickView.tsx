'use client';

import Link from 'next/link';
import ProductDetailContent from './ProductDetailContent';
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
            </div>
          </>
        )}
      </aside>
    </>
  );
}
