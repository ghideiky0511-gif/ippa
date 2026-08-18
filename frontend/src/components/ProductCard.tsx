'use client';
import Link from 'next/link';
import { COLOR_MAP } from '@/lib/config';
import { formatBRL, priceWithPercentOff } from '@/lib/format';
import { useCart } from './CartProvider';
import { useQuickView } from './QuickViewProvider';
import { useAuthUser } from './AuthProvider';
import type { Product } from '@/domain/products/types';

const MAX_DOTS = 6;

// Clicar na imagem abre o quick-view (escolher a grade). Clicar no + só
// adiciona o produto ao carrinho sem grade escolhida ainda (rascunho) —
// dá pra ir clicando + em várias peças e resolver a grade de todas depois,
// ou resolver uma de cada vez, como preferir. Vira ✓ quando já está no
// carrinho (rascunho ou grade escolhida); clicar de novo desfaz — tira o
// produto inteiro do carrinho e volta pro +. Ver addDraft/removeProduct em
// CartProvider.tsx e GroupedCartItems.tsx (como isso aparece no carrinho).
export default function ProductCard({ product }: { product: Product }) {
  const { addDraft, removeProduct, cart } = useCart();
  const { openQuickView } = useQuickView();
  const { showPrices } = useAuthUser();
  const colors = product.colors || [];
  const shown = colors.slice(0, MAX_DOTS);
  const extra = colors.length - shown.length;
  const inCart = cart.some((i) => i.id === product.id);

  return (
    <article className="flex flex-col overflow-hidden rounded-brand bg-brand-card shadow-[0_1px_4px_rgba(0,0,0,0.08)]">
      <div className="group relative aspect-[9/16] overflow-hidden">
        <button
          className="block size-full cursor-pointer border-0 bg-transparent p-0"
          aria-label={`Ver cores e tamanhos de ${product.name}`}
          onClick={() => openQuickView(product)}
        >
          {product.videoUrl ? (
            <video className="block size-full bg-[#eee] object-cover transition-transform duration-[250ms] group-hover:scale-[1.04]" src={product.videoUrl} autoPlay loop muted playsInline disablePictureInPicture />
          ) : (
            <img
              src={product.image || 'https://via.placeholder.com/400x500?text=Sem+imagem'}
              alt={product.name}
              className="block size-full bg-[#eee] object-cover transition-transform duration-[250ms] group-hover:scale-[1.04]"
            />
          )}
        </button>
        <button
          className={`absolute right-2.5 bottom-2.5 flex size-[34px] cursor-pointer items-center justify-center rounded-full border-0 text-xl leading-none text-white shadow-[0_2px_8px_rgba(0,0,0,0.3)] transition-[background,transform] hover:bg-brand-primary-dark ${inCart ? 'animate-card-plus bg-[#2e8b57] text-base hover:bg-[#256e46]' : 'bg-brand-primary'}`}
          aria-label={inCart ? `Remover ${product.name} do carrinho` : `Adicionar ${product.name} ao carrinho`}
          onClick={() => (inCart ? removeProduct(product.id) : addDraft(product))}
        >
          {inCart ? '✓' : '+'}
        </button>
        {shown.length > 0 && (
          <div className="pointer-events-none absolute right-11 bottom-2.5 left-2.5 flex translate-y-1 flex-wrap items-center gap-1.5 rounded-full bg-white/85 px-2 py-1.5 opacity-0 backdrop-blur-[2px] transition-[opacity,transform] duration-200 group-hover:translate-y-0 group-hover:opacity-100">
            {shown.map((c) => (
              <span key={c} className="inline-block size-3.5 shrink-0 rounded-full border border-black/15" style={{ background: COLOR_MAP[c] || '#ccc' }} title={c} />
            ))}
            {extra > 0 && <span className="text-[11px] text-brand-muted">+{extra}</span>}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="text-[11px] font-semibold tracking-[0.04em] text-brand-primary uppercase">{product.category || ''}</div>
        <Link href={`/produto/${product.id}`} className="hover:text-brand-primary">
          <h3 className="min-h-[2.6em] text-[15px] leading-[1.3]">{product.name}</h3>
        </Link>
        {product.sku && <div className="-mt-1 text-[11px] text-brand-muted">{product.sku}</div>}
        {!showPrices ? (
          <Link href="/login" className="text-[13px] font-semibold text-brand-primary">Entrar para ver o preço</Link>
        ) : product.activeDiscount ? (
          <div className="flex flex-wrap items-center gap-2" title={product.activeDiscount.label}>
            <span className="relative text-sm text-brand-muted after:absolute after:inset-x-0 after:top-1/2 after:h-px after:bg-current">{formatBRL(product.price)}</span>
            <span className="text-xl font-bold text-brand-primary">
              {formatBRL(priceWithPercentOff(product.price, product.activeDiscount.percent))}
            </span>
            <span className="rounded-full bg-brand-primary px-1.5 py-0.5 text-[11px] font-bold whitespace-nowrap text-white">-{product.activeDiscount.percent}%</span>
          </div>
        ) : (
          <div className="text-base font-bold text-[#1a1a1a]">{formatBRL(product.price)}</div>
        )}
      </div>
    </article>
  );
}
