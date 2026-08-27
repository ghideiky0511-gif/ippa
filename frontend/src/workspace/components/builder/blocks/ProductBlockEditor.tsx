// @ts-nocheck
'use client';
import { adminUi } from '@/workspace/lib/ui';
import ProductImage from '@/components/ProductImage';
import ProductPrice from '@/components/ProductPrice';

export default function ProductBlockEditor({ section, onUpdate, products }) {
  const product = (products || []).find((p) => p.id === section.productId);

  function handleChange(e) {
    const productId = e.target.value;
    onUpdate((s) => ({ ...s, productId }));
  }

  return (
    <div className={adminUi.field}>
      <label>ID do produto</label>
      <input value={section.productId || ''} onChange={handleChange} placeholder="cole o ID aqui" />

      {product ? (
        <div className="mt-2 flex items-center gap-3">
          <ProductImage src={product.image} alt={product.name} className="size-12 shrink-0 rounded-control bg-brand-background" />
          <div className="min-w-0">
            <div className={adminUi.productName}>{product.name}</div>
            <ProductPrice price={product.price} discount={product.activeDiscount} presentation="compact" />
          </div>
        </div>
      ) : (
        section.productId && (
          <p className="mt-2 text-xs text-danger">
            ID não encontrado no catálogo
          </p>
        )
      )}
    </div>
  );
}
