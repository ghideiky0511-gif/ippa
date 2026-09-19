'use client';
import { publicUi } from '@/lib/ui';

import { formatBRL } from '@/lib/format';
import { OrderItemRow } from './ui/order-item-row';
import type { CartItem } from '@/domain/orders/types';
import type { CartReviewGroup } from '@/contracts/ai';

// Visão somente leitura, agrupada por categoria — diferente de
// GroupedCartItems.tsx/CartRows.tsx (agrupam por produto e têm controles de
// edição); aqui a edição continua só em /carrinho.
export default function CartReviewGroups({ groups, cart }: { groups: CartReviewGroup[]; cart: CartItem[] }) {
  const byKey = new Map(cart.map((item) => [item.key, item]));

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => {
        const items = group.itemKeys.map((key) => byKey.get(key)).filter((item): item is CartItem => Boolean(item));
        if (items.length === 0) return null;
        const totalQty = items.reduce((sum, item) => sum + item.qty, 0);

        return (
          <div key={group.category} className={publicUi.checkoutItems}>
            <h2 className="mb-1 text-sm font-extrabold">
              {group.category} <span className="font-normal text-brand-muted">· {totalQty} peça{totalQty === 1 ? '' : 's'}</span>
            </h2>
            {items.map((item) => (
              <OrderItemRow
                key={item.key}
                item={item}
                mode="view"
                density="compact"
                trailing={<div className="text-sm font-semibold">{formatBRL(item.price * item.qty)}</div>}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
