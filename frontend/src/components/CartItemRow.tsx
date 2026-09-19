'use client';
import { toast } from 'sonner';
import { OrderItemRow } from './ui/order-item-row';

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
  return (
    <OrderItemRow
      item={item}
      mode="edit"
      minQty={1}
      onChangeQty={onChangeQty}
      onRemove={(key) => {
        onRemove(key);
        toast.success(`${item.name} removido do carrinho`);
      }}
    />
  );
}
