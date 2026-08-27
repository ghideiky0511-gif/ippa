// @ts-nocheck
'use client';
import { adminUi } from '@/workspace/lib/ui';
import ProductImage from '@/components/ProductImage';
import ProductPrice from '@/components/ProductPrice';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export default function SortableProductRow({ id, product, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className={adminUi.productRow}>
      <span className={adminUi.blockHandle} {...listeners} {...attributes}>
        ⠿
      </span>
      {product ? (
        <>
          <ProductImage src={product.image} alt={product.name} className="size-12 shrink-0 rounded-control bg-brand-background" />
          <span className={`${adminUi.productName} flex-1`}>
            {product.name}
          </span>
          <ProductPrice price={product.price} discount={product.activeDiscount} presentation="compact" />
        </>
      ) : (
        <span className="flex-1 text-sm text-danger">
          ID não encontrado: {id}
        </span>
      )}
      <button type="button" className={adminUi.iconButton} onClick={() => onRemove(id)}>
        Remover
      </button>
    </div>
  );
}
