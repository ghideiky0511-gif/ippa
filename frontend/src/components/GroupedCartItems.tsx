'use client';
import { publicUi } from '@/lib/ui';

import { useState } from 'react';
import CartItemRow from './CartItemRow';
import ProductImage from './ProductImage';
import { useCart } from './CartProvider';
import { useQuickView } from './QuickViewProvider';
import { useAuthUser } from './AuthProvider';
import { formatBRL, priceWithPercentOff } from '@/lib/format';
import type { CartItem } from '@/domain/orders/types';

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
  const { showPrices } = useAuthUser();
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
    <div className={publicUi.cartGroup}>
      <div className={publicUi.cartGroupSummary}>
        <ProductImage src={first.image} alt={first.name} className={publicUi.cartGroupImage} />
        <div className={publicUi.cartGroupInfo}>
          <div className="contents">{first.name}</div>
          {isDraftOnly ? (
            <div className="contents">Selecione a grade</div>
          ) : (
            <div className="contents">
              {colorCount} {colorCount === 1 ? 'cor' : 'cores'} · {totalQty} peça{totalQty === 1 ? '' : 's'}
              {showPrices && (
                <>
                  {' · '}
                  {applied ? (
                    <span className="contents">
                      <span className={publicUi.originalPrice}>{formatBRL(totalValue)}</span>{' '}
                      <span className={publicUi.discountedPrice}>{formatBRL(discountedTotal)}</span>
                    </span>
                  ) : (
                    formatBRL(totalValue)
                  )}
                </>
              )}
            </div>
          )}
        </div>
        <button
          className={publicUi.cartGroupToggle}
          onClick={isDraftOnly ? handleEditGrade : () => setExpanded((v) => !v)}
          disabled={isDraftOnly && !product}
        >
          {isDraftOnly ? 'selecionar' : expanded ? 'ver menos' : 'ver mais'}
        </button>
      </div>

      {expanded && !isDraftOnly && (
        <div className={publicUi.cartGroupItems}>
          {resolved.map((item) => (
            <CartItemRow key={item.key} item={item} onChangeQty={changeQty} onRemove={removeFromCart} />
          ))}
          <button className={publicUi.cartGroupEdit} onClick={handleEditGrade} disabled={!product}>
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
