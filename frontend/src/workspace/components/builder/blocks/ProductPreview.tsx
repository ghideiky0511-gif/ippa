// @ts-nocheck
'use client';
import { adminUi } from '@/workspace/lib/ui';
import ProductImage from '@/components/ProductImage';
import ProductPrice from '@/components/ProductPrice';

export default function ProductPreview({ section, products }) {
  const product = (products || []).find((p) => p.id === section.productId);

  if (!product) {
    return (
      <div className={adminUi.previewBlock}>
        <p>Nenhum produto selecionado ainda — cole o ID no painel ao lado.</p>
      </div>
    );
  }

  return (
    <article className="flex size-full min-h-0 flex-col gap-3 p-3">
      <ProductImage src={product.image} alt={product.name} className="min-h-0 w-full flex-1 rounded-control bg-brand-background" />
      <div className="min-w-0">
        {product.category && <p className="truncate text-xs font-semibold tracking-wide text-muted-foreground uppercase">{product.category}</p>}
        <h3 className="mt-1 truncate text-sm font-extrabold text-foreground">{product.name}</h3>
        <ProductPrice price={product.price} discount={product.activeDiscount} presentation="card" />
      </div>
    </article>
  );
}
