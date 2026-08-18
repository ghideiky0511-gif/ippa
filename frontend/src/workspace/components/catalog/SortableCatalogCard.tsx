// @ts-nocheck
'use client';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { formatBRL } from '@/workspace/lib/format';

export default function SortableCatalogCard({ product }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: product.id });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 5 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={[adminUi.productCard, isDragging ? 'opacity-50' : ''].join(' ')}
    >
      <div className="contents">
        <img src={product.image || ''} alt={product.name} />
      </div>
      <div className="contents">
        <h3>{product.name}</h3>
        <div className="contents">{formatBRL(product.price)}</div>
      </div>
    </div>
  );
}
