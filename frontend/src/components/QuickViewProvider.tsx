'use client';
import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Product } from '@/domain/products/types';

interface QuickViewContextValue {
  quickViewProduct: Product | null;
  transitioningProductId: string | null;
  openQuickView: (product: Product) => void;
  closeQuickView: () => void;
  startProductPageTransition: (productId: string) => void;
  completeProductPageTransition: (productId: string) => void;
}

const QuickViewContext = createContext<QuickViewContextValue | null>(null);

// Quick-view do produto (painel lateral com a grade de cor×tamanho) é
// global — montado uma vez em AppShell.tsx — porque precisa abrir de dois
// lugares diferentes: clique na imagem de um ProductCard (em qualquer
// página) e o "selecionar"/"ver mais" de uma peça ainda sem grade dentro
// do carrinho (GroupedCartItems.tsx). Antes cada página (CatalogApp,
// HomeApp) tinha seu próprio estado local de quick-view; centralizado
// aqui pra não duplicar.
export function QuickViewProvider({ children }: { children: ReactNode }) {
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [transitioningProductId, setTransitioningProductId] = useState<string | null>(null);

  const value: QuickViewContextValue = {
    quickViewProduct,
    transitioningProductId,
    openQuickView: (product) => {
      setTransitioningProductId(null);
      setQuickViewProduct(product);
    },
    closeQuickView: () => {
      setTransitioningProductId(null);
      setQuickViewProduct(null);
    },
    startProductPageTransition: setTransitioningProductId,
    completeProductPageTransition: (productId) => {
      if (transitioningProductId !== productId) return;
      setTransitioningProductId(null);
      setQuickViewProduct(null);
    },
  };

  return <QuickViewContext.Provider value={value}>{children}</QuickViewContext.Provider>;
}

export function useQuickView() {
  const ctx = useContext(QuickViewContext);
  if (!ctx) throw new Error('useQuickView precisa estar dentro de <QuickViewProvider>');
  return ctx;
}
