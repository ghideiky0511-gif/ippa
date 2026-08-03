'use client';

import Link from 'next/link';
import ProductDetailContent from './ProductDetailContent';
import { useCart } from './CartProvider';
import { formatBRL } from '@/lib/format';

function MiniCartPreview() {
  const { cart, cartCount, cartTotal, openCart } = useCart();
  return (
    <div className="minicart-float">
      <div className="minicart-float-header">
        <span>🛍 {cartCount} peça(s)</span>
        <span>{formatBRL(cartTotal)}</span>
      </div>
      {cart.length === 0 ? (
        <div className="minicart-float-empty">Carrinho vazio — adicione pela grade ao lado.</div>
      ) : (
        <div className="minicart-float-items">
          {cart.map((item) => (
            <img
              key={item.key}
              src={item.image || 'https://via.placeholder.com/80x140?text=Sem+imagem'}
              alt={item.name}
              title={`${item.name} — ${[item.color, item.size].filter(Boolean).join(' / ')} x${item.qty}`}
            />
          ))}
        </div>
      )}
      <button className="minicart-float-open" onClick={openCart}>Ver carrinho completo</button>
    </div>
  );
}

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
      {isOpen && <MiniCartPreview />}
    </>
  );
}
