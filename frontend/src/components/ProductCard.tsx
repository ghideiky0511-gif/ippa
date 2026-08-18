'use client';

import Link from '@/components/TenantLink';
import { Check, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { COLOR_MAP } from '@/lib/config';
import { formatBRL, priceWithPercentOff } from '@/lib/format';
import { useCart } from './CartProvider';
import { useQuickView } from './QuickViewProvider';
import { useAuthUser } from './AuthProvider';
import type { Product } from '@/domain/products/types';

const MAX_DOTS = 6;

export default function ProductCard({ product }: { product: Product }) {
  const { addDraft, removeProduct, cart } = useCart();
  const { openQuickView } = useQuickView();
  const { showPrices } = useAuthUser();
  const colors = product.colors || [];
  const shown = colors.slice(0, MAX_DOTS);
  const extra = colors.length - shown.length;
  const inCart = cart.some((i) => i.id === product.id);

  function toggleCart() {
    if (inCart) {
      removeProduct(product.id);
      toast.success(`${product.name} removido do carrinho`);
      return;
    }
    addDraft(product);
    toast.success(`${product.name} adicionado ao carrinho`);
  }

  return (
    <Card className="group flex min-w-0 flex-col overflow-hidden transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(44,28,36,.12)]">
      <div className="relative aspect-[9/16] overflow-hidden">
        <button
          className="block size-full cursor-pointer border-0 bg-transparent p-0"
          aria-label={`Ver cores e tamanhos de ${product.name}`}
          onClick={() => openQuickView(product)}
        >
          {product.videoUrl ? (
            <video className="block size-full bg-brand-background object-cover transition-transform duration-[250ms] group-hover:scale-[1.04]" src={product.videoUrl} autoPlay loop muted playsInline disablePictureInPicture />
          ) : (
            <img src={product.image || 'https://via.placeholder.com/400x500?text=Sem+imagem'} alt={product.name} className="block size-full bg-brand-background object-cover transition-transform duration-[250ms] group-hover:scale-[1.04]" />
          )}
        </button>
        <button
          className={`absolute right-2.5 bottom-2.5 flex size-11 cursor-pointer items-center justify-center rounded-full border-0 text-white shadow-[0_2px_8px_rgba(0,0,0,0.3)] transition-[background,transform] hover:scale-105 ${inCart ? 'animate-card-plus bg-success hover:bg-[#17633f]' : 'bg-brand-primary hover:bg-brand-primary-dark'}`}
          aria-label={inCart ? `Remover ${product.name} do carrinho` : `Adicionar ${product.name} ao carrinho`}
          onClick={toggleCart}
        >
          {inCart ? <Check className="size-5" aria-hidden="true" /> : <Plus className="size-5" aria-hidden="true" />}
        </button>
        {shown.length > 0 && (
          <div className="pointer-events-none absolute right-14 bottom-3 left-2.5 hidden flex-wrap items-center gap-1.5 rounded-full bg-white/90 px-2 py-1.5 backdrop-blur-sm group-hover:flex sm:flex">
            {shown.map((c) => <span key={c} className="inline-block size-3.5 shrink-0 rounded-full border border-black/15" style={{ background: COLOR_MAP[c] || '#ccc' }} title={c} />)}
            {extra > 0 && <span className="text-[11px] text-brand-muted">+{extra}</span>}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        {product.category && <Badge>{product.category}</Badge>}
        <Link href={`/produto/${product.id}`} className="hover:text-brand-primary">
          <h3 className="min-h-[2.7em] text-[15px] font-semibold leading-[1.35]">{product.name}</h3>
        </Link>
        {product.sku && <div className="-mt-1 text-[11px] text-brand-muted">{product.sku}</div>}
        {!showPrices ? (
          <Link href="/login" className="text-[13px] font-semibold text-brand-primary">Entrar para ver o preço</Link>
        ) : product.activeDiscount ? (
          <div className="flex flex-wrap items-center gap-2" title={product.activeDiscount.label}>
            <span className="relative text-sm text-brand-muted after:absolute after:inset-x-0 after:top-1/2 after:h-px after:bg-current">{formatBRL(product.price)}</span>
            <span className="text-xl font-bold text-brand-primary">{formatBRL(priceWithPercentOff(product.price, product.activeDiscount.percent))}</span>
            <Badge className="bg-brand-primary text-white">-{product.activeDiscount.percent}%</Badge>
          </div>
        ) : <div className="text-base font-bold text-foreground">{formatBRL(product.price)}</div>}
      </div>
    </Card>
  );
}
