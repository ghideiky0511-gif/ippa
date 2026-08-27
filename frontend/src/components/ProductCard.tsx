'use client';

import { useEffect, useRef } from 'react';
import Link from '@/components/TenantLink';
import { Check, Plus } from 'lucide-react';
import { useCart } from './CartProvider';
import { useQuickView } from './QuickViewProvider';
import { useAuthUser } from './AuthProvider';
import CatalogProductCard from './CatalogProductCard';
import ProductPrice from './ProductPrice';
import type { Product } from '@/domain/products/types';

// Janela pra distinguir "1 clique pra desfazer" de "2 cliques seguidos pra
// marcar sugestão" — só importa pra colaboradoras da loja (ver handleClick abaixo).
const SUGGEST_WINDOW_MS = 300;

export default function ProductCard({ product, priority, index }: { product: Product; priority?: boolean; index?: number }) {
  const { addProductDraft, removeProduct, cart } = useCart();
  const { openQuickView } = useQuickView();
  const { authUser, showPrices, suggestedPiecesEnabled } = useAuthUser();
  // "Colaboradora da loja" = qualquer papel que não seja cliente (admin,
  // vendedora, expedição, entregador) — a ferramenta de sugestão é da
  // equipe da loja, não só de quem tem o papel 'vendedora'. Ferramenta
  // desligada em /ferramentas (storeSettings.features.suggestedPieces)
  // desliga o gesto pra todo mundo, cliente incluída.
  const isStoreStaff = suggestedPiecesEnabled && !!authUser && authUser.role !== 'cliente';
  const cartItemsForProduct = cart.filter((item) => item.id === product.id);
  const inCart = cartItemsForProduct.length > 0;
  const isSuggested = suggestedPiecesEnabled && cartItemsForProduct.some((item) => item.suggested);

  // Timeout pendente do clique "talvez seja o 1º de um duplo-clique" — só
  // colaboradoras da loja precisam disso (ver handleClick). Cancelado se o
  // componente desmontar antes do timeout disparar (ex.: filtro removeu o card da grade).
  const pendingActionRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (pendingActionRef.current) clearTimeout(pendingActionRef.current);
  }, []);

  function clearPendingAction() {
    if (pendingActionRef.current) {
      clearTimeout(pendingActionRef.current);
      pendingActionRef.current = null;
    }
  }

  function handleClick() {
    if (!isStoreStaff) {
      // Cliente (ou ferramenta desligada): sem gesto de duplo-clique, cada
      // clique já é a ação final — seleciona/desfaz na hora.
      if (inCart) removeProduct(product.id);
      else addProductDraft(product);
      return;
    }

    if (pendingActionRef.current) {
      // 2º clique dentro da janela do 1º — comita direto como sugerido
      // (fundo amarelo), sem passar pelo estado "selecionado" (verde) no
      // meio do caminho, seja a peça nova ("+") ou já selecionada antes.
      clearPendingAction();
      addProductDraft(product, true);
      return;
    }

    if (isSuggested) {
      // Não há "nível" acima de sugerido — clique único desfaz na hora.
      removeProduct(product.id);
      return;
    }

    // Só resolve depois da janela passar — dá tempo pra um 2º clique virar
    // sugestão em vez de completar esta ação simples (selecionar ou desfazer).
    pendingActionRef.current = setTimeout(() => {
      pendingActionRef.current = null;
      if (inCart) removeProduct(product.id);
      else addProductDraft(product);
    }, SUGGEST_WINDOW_MS);
  }

  const imageAction = (
    <button
      type="button"
      className={`absolute right-2.5 bottom-2.5 flex size-11 cursor-pointer items-center justify-center rounded-full border-0 text-white shadow-[0_2px_8px_rgba(0,0,0,0.3)] transition-[background,transform] hover:scale-105 ${isSuggested ? 'bg-warning hover:bg-[#7a4e00]' : inCart ? 'animate-card-plus bg-success hover:bg-[#17633f]' : 'bg-brand-primary hover:bg-brand-primary-dark'}`}
      aria-label={
        isSuggested
          ? `${product.name} sugerida pela equipe da loja — clique pra desfazer`
          : inCart
            ? `${product.name} selecionada — clique pra desfazer`
            : `Adicionar ${product.name} ao carrinho`
      }
      onClick={handleClick}
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
  ) : <ProductPrice price={product.price} discount={product.activeDiscount} presentation="card" />;

  return <CatalogProductCard product={product} onOpen={() => openQuickView(product)} imageAction={imageAction} title={title} price={price} priority={priority} index={index} />;
}
