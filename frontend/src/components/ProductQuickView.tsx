'use client';

import { useEffect, useState } from 'react';
import Link from '@/components/TenantLink';
import { ShoppingBag } from 'lucide-react';
import ProductDetailContent from './ProductDetailContent';
import SimilarProducts from './SimilarProducts';
import { useCart } from './CartProvider';
import { formatBRL } from '@/lib/format';
import { Sheet, SheetContent, SheetHeader } from '@/components/ui/sheet';
import type { Product } from '@/domain/products/types';

function MiniCartPreview() {
  const { cartCount, cartTotal, openCart } = useCart();
  return (
    <button className="inline-flex min-h-11 items-center gap-2 rounded-control px-2 text-[13px] font-bold text-foreground hover:bg-brand-background" onClick={openCart}>
      <ShoppingBag className="size-4 text-brand-primary" aria-hidden="true" />
      <span>{cartCount} peça(s)</span><span className="text-muted-foreground">{formatBRL(cartTotal)}</span>
    </button>
  );
}

export default function ProductQuickView({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const isOpen = Boolean(product);
  const [similar, setSimilar] = useState<Product[]>([]);

  useEffect(() => {
    if (!product) return;
    let cancelled = false;
    fetch('/api/similar-products', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ context: 'quickview', productIds: [product.id] }),
    })
      .then((r) => (r.ok ? r.json() : { products: [] }))
      .then((data) => { if (!cancelled) setSimilar(data.products || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [product]);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[min(100%,34rem)]">
        {product && <>
          <SheetHeader>
            <Link href={`/produto/${product.id}`} className="text-[13px] font-bold text-brand-primary hover:underline">Abrir página do produto</Link>
            <MiniCartPreview />
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-5">
            <ProductDetailContent product={product} />
            <SimilarProducts products={similar} />
          </div>
        </>}
      </SheetContent>
    </Sheet>
  );
}
