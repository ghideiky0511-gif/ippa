'use client';

import Link from 'next/link';
import { COLOR_MAP } from '@/lib/config';
import { formatBRL, priceWithPercentOff } from '@/lib/format';
import { useCart } from './CartProvider';
import { useQuickView } from './QuickViewProvider';
import { useAuthUser } from './AuthProvider';
import type { Product } from '@/lib/types';

const MAX_DOTS = 6;

// Clicar na imagem abre o quick-view (escolher a grade). Clicar no + só
// adiciona o produto ao carrinho sem grade escolhida ainda (rascunho) —
// dá pra ir clicando + em várias peças e resolver a grade de todas depois,
// ou resolver uma de cada vez, como preferir. Vira ✓ quando já está no
// carrinho (rascunho ou grade escolhida); clicar de novo desfaz — tira o
// produto inteiro do carrinho e volta pro +. Ver addDraft/removeProduct em
// CartProvider.tsx e GroupedCartItems.tsx (como isso aparece no carrinho).
export default function ProductCard({ product }: { product: Product }) {
  const { addDraft, removeProduct, cart } = useCart();
  const { openQuickView } = useQuickView();
  const { showPrices } = useAuthUser();
  const colors = product.colors || [];
  const shown = colors.slice(0, MAX_DOTS);
  const extra = colors.length - shown.length;
  const inCart = cart.some((i) => i.id === product.id);

  return (
    <article className="card">
      <div className="card-media">
        <button
          className="card-media-open"
          aria-label={`Ver cores e tamanhos de ${product.name}`}
          onClick={() => openQuickView(product)}
        >
          {product.videoUrl ? (
            <video src={product.videoUrl} autoPlay loop muted playsInline disablePictureInPicture />
          ) : (
            <img
              src={product.image || 'https://via.placeholder.com/400x500?text=Sem+imagem'}
              alt={product.name}
            />
          )}
        </button>
        <button
          className={'card-plus' + (inCart ? ' added' : '')}
          aria-label={inCart ? `Remover ${product.name} do carrinho` : `Adicionar ${product.name} ao carrinho`}
          onClick={() => (inCart ? removeProduct(product.id) : addDraft(product))}
        >
          {inCart ? '✓' : '+'}
        </button>
        {shown.length > 0 && (
          <div className="color-dots">
            {shown.map((c) => (
              <span key={c} className="dot" style={{ background: COLOR_MAP[c] || '#ccc' }} title={c} />
            ))}
            {extra > 0 && <span className="dot-extra">+{extra}</span>}
          </div>
        )}
      </div>
      <div className="body">
        <div className="cat">{product.category || ''}</div>
        <Link href={`/produto/${product.id}`} className="card-title-link">
          <h3>{product.name}</h3>
        </Link>
        {product.sku && <div className="card-sku">{product.sku}</div>}
        {!showPrices ? (
          <Link href="/login" className="price price-locked">Entrar para ver o preço</Link>
        ) : product.activeDiscount ? (
          <div className="price-discount-row" title={product.activeDiscount.label}>
            <span className="price-original">{formatBRL(product.price)}</span>
            <span className="price price-discounted">
              {formatBRL(priceWithPercentOff(product.price, product.activeDiscount.percent))}
            </span>
            <span className="discount-badge">-{product.activeDiscount.percent}%</span>
          </div>
        ) : (
          <div className="price">{formatBRL(product.price)}</div>
        )}
      </div>
    </article>
  );
}
