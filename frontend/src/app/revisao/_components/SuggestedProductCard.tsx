'use client';

import { toast } from 'sonner';
import ProductImage from '@/components/ProductImage';
import ProductPrice from '@/components/ProductPrice';
import { useCart } from '@/components/CartProvider';
import { useQuickView } from '@/components/QuickViewProvider';
import { useAuthUser } from '@/components/AuthProvider';
import type { CartReviewSuggestedProduct } from '@/contracts/ai';

// Peça real do catálogo, resolvida pelo backend a partir da categoria que a
// IA apontou (nunca inventada pela IA — ver cartReviewInsightService.ts).
// "Adicionar conforme sugestão" usa o mesmo mecanismo de rascunho sem grade
// de "sugestão da vendedora" (ProductCard.tsx): evita comitar cor/tamanho
// errado, a cliente escolhe a grade depois no carrinho ou no quick view.
export default function SuggestedProductCard({ product }: { product: CartReviewSuggestedProduct }) {
  const { addProductDraft } = useCart();
  const { openQuickView } = useQuickView();
  const { showPrices } = useAuthUser();

  function handleAdd() {
    addProductDraft(product, true);
    toast.success(`${product.name} adicionada ao carrinho — escolha a cor e o tamanho.`);
  }

  return (
    <div className="flex items-center gap-2.5 rounded-control border border-border bg-surface p-2">
      <ProductImage src={product.image} alt={product.name} className="h-16 w-12 shrink-0 rounded-md bg-brand-background" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-semibold text-foreground">{product.name}</div>
        {showPrices && <ProductPrice price={product.price} discount={product.activeDiscount} presentation="compact" />}
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <button
            type="button"
            className="rounded-full bg-brand-primary px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-primary-dark"
            onClick={handleAdd}
          >
            Adicionar conforme sugestão
          </button>
          <button
            type="button"
            className="rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-foreground hover:bg-brand-background"
            onClick={() => openQuickView(product)}
          >
            Ver mais
          </button>
        </div>
      </div>
    </div>
  );
}
