'use client';

import Link from '@/components/TenantLink';
import { Check, Plus } from 'lucide-react';
import { formatBRL, priceWithPercentOff } from '@/lib/format';
import { useCart } from './CartProvider';
import { useQuickView } from './QuickViewProvider';
import { useAuthUser } from './AuthProvider';
import CatalogProductCard from './CatalogProductCard';
import type { Product } from '@/domain/products/types';

export default function ProductCard({ product }: { product: Product }) {
  const { addProductDraft, cart } = useCart();
  const { openQuickView } = useQuickView();
  const { showPrices } = useAuthUser();
  const inCart = cart.some((item) => item.id === product.id);

  function addProductToCart() {
    if (inCart) return;
    addProductDraft(product);
  }

  const imageAction = (
    <button
      type="button"
      className={`absolute right-2.5 bottom-2.5 flex size-11 cursor-pointer items-center justify-center rounded-full border-0 text-white shadow-[0_2px_8px_rgba(0,0,0,0.3)] transition-[background,transform] hover:scale-105 disabled:cursor-default disabled:hover:scale-100 ${inCart ? 'animate-card-plus bg-success hover:bg-[#17633f]' : 'bg-brand-primary hover:bg-brand-primary-dark'}`}
      aria-label={inCart ? `${product.name} já está no carrinho` : `Adicionar ${product.name} ao carrinho`}
      onClick={addProductToCart}
      disabled={inCart}
    >
      {inCart ? <Check className="size-5" aria-hidden="true" /> : <Plus className="size-5" aria-hidden="true" />}
    </button>
  );

  const title = (
    <Link href={`/produto/${product.id}`} className="hover:text-brand-primary">
      {product.name}
    </Link>
  );

  const price = !showPrices ? (
    <Link href="/login" className="text-[13px] font-semibold text-brand-primary">Entrar para ver o preço</Link>
  ) : product.activeDiscount ? (
    <div className="flex flex-wrap items-center gap-2" title={product.activeDiscount.label}>
      <span className="relative text-sm text-brand-muted after:absolute after:inset-x-0 after:top-1/2 after:h-px after:bg-current">{formatBRL(product.price)}</span>
      <span className="text-xl font-bold text-brand-primary">{formatBRL(priceWithPercentOff(product.price, product.activeDiscount.percent))}</span>
      <span className="rounded-full bg-brand-primary px-2 py-0.5 text-xs font-semibold text-white">-{product.activeDiscount.percent}%</span>
    </div>
  ) : <div className="text-base font-bold text-foreground">{formatBRL(product.price)}</div>;

  return <CatalogProductCard product={product} onOpen={() => openQuickView(product)} imageAction={imageAction} title={title} price={price} />;
}
