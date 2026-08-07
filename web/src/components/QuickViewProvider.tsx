'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Product } from '@/lib/types';

interface QuickViewContextValue {
  quickViewProduct: Product | null;
  openQuickView: (product: Product) => void;
  closeQuickView: () => void;
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

  const value: QuickViewContextValue = {
    quickViewProduct,
    openQuickView: setQuickViewProduct,
    closeQuickView: () => setQuickViewProduct(null),
  };

  return <QuickViewContext.Provider value={value}>{children}</QuickViewContext.Provider>;
}

export function useQuickView() {
  const ctx = useContext(QuickViewContext);
  if (!ctx) throw new Error('useQuickView precisa estar dentro de <QuickViewProvider>');
  return ctx;
}
