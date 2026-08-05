'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { formatBRL } from '@/lib/format';

export default function SortableProductRow({ id, product, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="collection-product-row">
      <span className="block-card-handle" {...listeners} {...attributes}>
        ⠿
      </span>
      {product ? (
        <>
          <img src={product.image || ''} alt={product.name} />
          <span className="product-item-name" style={{ flex: 1 }}>
            {product.name}
          </span>
          <span className="product-item-price">{formatBRL(product.price)}</span>
        </>
      ) : (
        <span className="product-item-status" style={{ flex: 1 }}>
          ID não encontrado: {id}
        </span>
      )}
      <button className="btn btn-icon btn-danger" onClick={() => onRemove(id)}>
        Remover
      </button>
    </div>
  );
}
