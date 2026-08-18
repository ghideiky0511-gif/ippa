'use client';
import { publicUi } from '@/lib/ui';

import type { CartItem } from '@/domain/orders/types';

export default function CartItemRow({
  item,
  onChangeQty,
  onRemove,
}: {
  item: CartItem;
  onChangeQty: (key: string, qty: number) => void;
  onRemove: (key: string) => void;
}) {
  const variantParts = [item.color, item.size].filter(Boolean);
  return (
    <div className={publicUi.cartItem}>
      <img src={item.image || 'https://via.placeholder.com/100x120?text=Sem+imagem'} alt={item.name} />
      <div className={publicUi.cartItemInfo}>
        <div className="contents">{item.name}</div>
        {variantParts.length > 0 && <div className="contents">{variantParts.join(' · ')}</div>}
        {item.backorderDate && (
          <div className="contents">Parte sob encomenda — {item.backorderDate}</div>
        )}
        <div className={publicUi.qtyRow}>
          <button onClick={() => onChangeQty(item.key, Math.max(1, item.qty - 1))}>-</button>
          <span>{item.qty}</span>
          <button onClick={() => onChangeQty(item.key, item.qty + 1)}>+</button>
          <button className={publicUi.remove} style={{ marginLeft: 10 }} onClick={() => onRemove(item.key)}>remover</button>
        </div>
      </div>
    </div>
  );
}
