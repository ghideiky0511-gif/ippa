'use client';

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ShoppingBag } from 'lucide-react';
import ProductDetailContent from './ProductDetailContent';
import ProductPageLink from './ProductPageLink';
import SimilarProducts from './SimilarProducts';
import { useCart } from './CartProvider';
import { useQuickView } from './QuickViewProvider';
import { formatBRL } from '@/lib/format';
import { Sheet, SheetContent, SheetHeader } from '@/components/ui/sheet';
import { z } from 'zod';
import { ProductSchema, type Product } from '@/domain/products/types';

const SimilarProductsResultSchema = z.object({ products: z.array(ProductSchema) });

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
  if (!product) return null;
  return <OpenProductQuickView key={product.id} product={product} onClose={onClose} />;
}

function OpenProductQuickView({ product, onClose }: { product: Product; onClose: () => void }) {
  const isOpen = true;
  const { transitioningProductId } = useQuickView();
  const [similar, setSimilar] = useState<Product[]>([]);
  const [similarProductId, setSimilarProductId] = useState<string | null>(null);
  const [dragStartY, setDragStartY] = useState<number | null>(null);
  const [sheetOffsetY, setSheetOffsetY] = useState(0);
  const productId = product.id;
  const isTransitioningToPage = transitioningProductId === product.id;
  const isLoadingSimilar = similarProductId !== productId;
  const currentSimilar = similarProductId === productId ? similar : [];

  function closeQuickView() {
    setSimilar([]);
    setSimilarProductId(null);
    onClose();
  }

  function startSheetDrag(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragStartY(event.clientY);
  }

  function moveSheetDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (dragStartY === null) return;
    setSheetOffsetY(Math.max(0, event.clientY - dragStartY));
  }

  function finishSheetDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (dragStartY === null) return;
    const offsetY = Math.max(0, event.clientY - dragStartY);
    setDragStartY(null);
    setSheetOffsetY(0);
    if (offsetY >= 112) closeQuickView();
  }

  useEffect(() => {
    let cancelled = false;
    fetch('/api/similar-products', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ context: 'quickview', productIds: [productId] }),
    })
      .then((r) => (r.ok ? r.json() : { products: [] }))
      .then((data) => {
        if (cancelled) return;
        const parsed = SimilarProductsResultSchema.safeParse(data);
        setSimilar(parsed.success ? parsed.data.products : []);
        setSimilarProductId(productId);
      })
      .catch(() => {
        if (cancelled) return;
        setSimilarProductId(productId);
      });
    return () => { cancelled = true; };
  }, [productId]);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && closeQuickView()}>
      <SheetContent
        side="right"
        mobileSide="bottom"
        overlayClassName={isTransitioningToPage ? 'pointer-events-none bg-black/0 transition-colors duration-200' : 'transition-colors duration-200'}
        className={`w-full md:w-[70vw] ${isTransitioningToPage ? 'pointer-events-none border-transparent bg-transparent shadow-none transition-[transform,background-color,border-color,box-shadow] duration-150' : ''}`}
        style={sheetOffsetY ? { transform: `translateY(${sheetOffsetY}px)` } : undefined}
      >
        <motion.div layoutRoot className="flex h-full min-h-0 flex-col">
          <div
            className={`flex touch-none justify-center py-3 transition-opacity duration-150 md:hidden ${isTransitioningToPage ? 'opacity-0' : ''}`}
            onPointerDown={startSheetDrag}
            onPointerMove={moveSheetDrag}
            onPointerUp={finishSheetDrag}
            onPointerCancel={finishSheetDrag}
          ><span className="h-1 w-10 rounded-full bg-border" /></div>
          <div className={`transition-opacity duration-150 ${isTransitioningToPage ? 'opacity-0' : ''}`}>
            <SheetHeader>
            <ProductPageLink productId={product.id} className="text-[13px] font-bold text-brand-primary hover:underline">
              Abrir página do produto
            </ProductPageLink>
            <MiniCartPreview />
            </SheetHeader>
          </div>
          <motion.div layoutScroll className="flex-1 overflow-y-auto p-4">
            <ProductDetailContent product={product} presentation="panel" />
            <div className={`transition-opacity duration-150 ${isTransitioningToPage ? 'opacity-0' : ''}`} aria-hidden={isTransitioningToPage}>
              <SimilarProducts products={currentSimilar} loading={isLoadingSimilar} />
            </div>
          </motion.div>
        </motion.div>
      </SheetContent>
    </Sheet>
  );
}
