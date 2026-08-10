'use client';

import { useState } from 'react';
import CartItemRow from './CartItemRow';
import { useCart } from './CartProvider';
import { useQuickView } from './QuickViewProvider';
import { formatBRL, priceWithPercentOff } from '@/lib/format';
import type { CartItem } from '@/lib/types';

function isDraft(item: CartItem): boolean {
  return !item.color && !item.size;
}

// Um produto pode ter várias linhas no carrinho (uma por cor×tamanho
// escolhido) — agrupadas aqui por produto pra não poluir a lista: resumo
// recolhido (quantas cores, quantas peças, total) com "ver mais" pra
// expandir e ver/editar linha por linha. Se o produto só tem o rascunho
// (adicionado pelo + do card, sem grade ainda — ver addDraft em
// CartProvider.tsx), mostra "selecione a grade" e o botão abre o
// quick-view em vez de expandir uma lista vazia.
function CartProductGroup({ productId, items }: { productId: string; items: CartItem[] }) {
  const { changeQty, removeFromCart, catalogById, cartDiscountByProduct } = useCart();
  const { openQuickView } = useQuickView();
  const [expanded, setExpanded] = useState(false);

  const resolved = items.filter((i) => !isDraft(i) && i.qty > 0);
  const isDraftOnly = resolved.length === 0;
  const first = items[0];
  const product = catalogById[productId];

  const totalQty = resolved.reduce((sum, i) => sum + i.qty, 0);
  const totalValue = resolved.reduce((sum, i) => sum + i.price * i.qty, 0);
  const colorCount = new Set(resolved.map((i) => i.color)).size;
  const applied = cartDiscountByProduct[productId];
  const discountedTotal = applied ? priceWithPercentOff(totalValue, applied.percent) : totalValue;

  function handleEditGrade() {
    if (product) openQuickView(product);
  }

  return (
    <div className="cart-group">
      <div className="cart-group-summary">
        <img src={first.image || 'https://via.placeholder.com/100x120?text=Sem+imagem'} alt={first.name} />
        <div className="cart-group-info">
          <div className="name">{first.name}</div>
          {isDraftOnly ? (
            <div className="variant cart-group-pending">Selecione a grade</div>
          ) : (
            <div className="variant">
              {colorCount} {colorCount === 1 ? 'cor' : 'cores'} · {totalQty} peça{totalQty === 1 ? '' : 's'} ·{' '}
              {applied ? (
                <span className="cart-group-price-discount">
                  <span className="price-original">{formatBRL(totalValue)}</span>{' '}
                  <span className="price-discounted">{formatBRL(discountedTotal)}</span>
                </span>
              ) : (
                formatBRL(totalValue)
              )}
            </div>
          )}
        </div>
        <button
          className="cart-group-toggle"
          onClick={isDraftOnly ? handleEditGrade : () => setExpanded((v) => !v)}
          disabled={isDraftOnly && !product}
        >
          {isDraftOnly ? 'selecionar' : expanded ? 'ver menos' : 'ver mais'}
        </button>
      </div>

      {expanded && !isDraftOnly && (
        <div className="cart-group-items">
          {resolved.map((item) => (
            <CartItemRow key={item.key} item={item} onChangeQty={changeQty} onRemove={removeFromCart} />
          ))}
          <button className="cart-group-edit" onClick={handleEditGrade} disabled={!product}>
            + editar grade
          </button>
        </div>
      )}
    </div>
  );
}

export default function GroupedCartItems({ cart }: { cart: CartItem[] }) {
  const order: string[] = [];
  const byProduct: Record<string, CartItem[]> = {};
  for (const item of cart) {
    if (!byProduct[item.id]) {
      byProduct[item.id] = [];
      order.push(item.id);
    }
    byProduct[item.id].push(item);
  }

  return (
    <>
      {order.map((id) => (
        <CartProductGroup key={id} productId={id} items={byProduct[id]} />
      ))}
    </>
  );
}
