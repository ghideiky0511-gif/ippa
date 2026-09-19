'use client';
import type { ReactNode } from 'react';
import ProductImage from '@/components/ProductImage';
import { publicUi } from '@/lib/ui';
import type { CartItem } from '@/domain/orders/types';

export type OrderItemRowMode = 'view' | 'edit';
export type OrderItemRowDensity = 'compact' | 'comfortable';

export type OrderItemRowProps = {
  item: CartItem;
  mode: OrderItemRowMode;
  density?: OrderItemRowDensity;
  onChangeQty?: (key: string, qty: number) => void;
  onRemove?: (key: string) => void;
  minQty?: 0 | 1;
  maxQty?: number;
  meta?: ReactNode;
  trailing?: ReactNode;
  className?: string;
};

// Linha de item de pedido unificada — usada tanto no carrinho/checkout
// (publicUi) quanto no talão do workspace (className próprio absorve a borda
// adminUi sem este componente depender de adminUi). `mode='edit'` mostra o
// stepper de quantidade; `mode='view'` é só leitura (resumo de pedido, pedido
// fechado).
export function OrderItemRow({
  item,
  mode,
  density = 'comfortable',
  onChangeQty,
  onRemove,
  minQty = 1,
  maxQty,
  meta,
  trailing,
  className,
}: OrderItemRowProps) {
  const variantParts = [item.color, item.size].filter(Boolean);
  const imageClassName = density === 'compact' ? publicUi.orderRowImageSm : publicUi.orderRowImage;

  const min = minQty ?? 1;
  const atMin = item.qty <= min;
  const atMax = maxQty !== undefined && item.qty >= maxQty;

  function dec() {
    onChangeQty?.(item.key, Math.max(min, item.qty - 1));
  }
  function inc() {
    onChangeQty?.(item.key, item.qty + 1);
  }

  return (
    <div className={className ?? publicUi.orderRow}>
      <ProductImage src={item.image} alt={item.name} className={imageClassName} />
      <div className={publicUi.orderRowInfo}>
        <div className="name">{item.name}</div>
        {mode === 'view' ? (
          <div className="variant">
            {variantParts.length > 0 ? `${variantParts.join(' · ')} · ` : ''}
            {item.qty}x
          </div>
        ) : (
          variantParts.length > 0 && <div className="variant">{variantParts.join(' · ')}</div>
        )}
        {item.backorderDate && <div className="variant">Parte sob encomenda — {item.backorderDate}</div>}
        {meta}
        {mode === 'edit' && (
          <div className={publicUi.qtyRow}>
            <button type="button" onClick={dec} disabled={atMin}>-</button>
            <span>{item.qty}</span>
            <button type="button" onClick={inc} disabled={atMax}>+</button>
            {onRemove && (
              <button type="button" className={publicUi.remove} style={{ marginLeft: 10 }} onClick={() => onRemove(item.key)}>
                remover
              </button>
            )}
          </div>
        )}
      </div>
      {trailing}
    </div>
  );
}
