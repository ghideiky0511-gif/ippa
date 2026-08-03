'use client';

import Link from 'next/link';
import ProductDetailContent from './ProductDetailContent';

export default function ProductQuickView({ product, onClose }) {
  const isOpen = Boolean(product);
  return (
    <>
      <div className={'quickview-overlay' + (isOpen ? ' open' : '')} onClick={onClose} />
      <aside className={'quickview-drawer' + (isOpen ? ' open' : '')}>
        {product && (
          <>
            <div className="quickview-header">
              <Link href={`/produto/${product.id}`} className="quickview-fulllink">Abrir página do produto ↗</Link>
              <button aria-label="Fechar" onClick={onClose}>&times;</button>
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
