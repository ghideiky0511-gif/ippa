'use client';

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { useTalao } from './TalaoProvider';
import type { CartItem, Order, Product, ShippingOption } from '@/lib/types';

interface CartContextValue {
  cart: CartItem[];
  cartCount: number;
  cartTotal: number;
  isCartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  addToCart: (product: Product, color: string, size: string, qty: number, stockQty?: number) => void;
  // Adiciona o produto ao carrinho sem cor/tamanho definidos ainda (botão +
  // do card) — vira um item "rascunho" (ver CartItem em types.ts), qty 0,
  // até a pessoa escolher a grade no quick-view. Não duplica: se o produto
  // já tem qualquer item no carrinho (rascunho ou resolvido), não faz nada.
  addDraft: (product: Product) => void;
  // Contrário do addDraft — tira TODAS as linhas daquele produto do
  // carrinho (rascunho e/ou grade já escolhida), usado quando clica no ✓
  // do card pra desfazer.
  removeProduct: (productId: string) => void;
  changeQty: (key: string, qty: number) => void;
  removeFromCart: (key: string) => void;
  setBackorderDate: (key: string, date: string | null) => void;
  clearCart: () => void;
  saveOrderToHistory: (items: CartItem[], total: number, extra?: Record<string, unknown>) => Order;
  shipping: ShippingOption | null;
  setShipping: (shipping: ShippingOption | null) => void;
  clearShipping: () => void;
  // Catálogo indexado por id — usado por GroupedCartItems.tsx pra achar o
  // Product completo de um item do carrinho (reabrir o quick-view daquele
  // produto pra editar a grade). Carrinho só guarda id/nome/imagem/preço
  // do item, não o produto inteiro (cores, tamanhos, variantes).
  catalogById: Record<string, Product>;
}

const CartContext = createContext<CartContextValue | null>(null);
const CART_KEY = 'ippa_cart_v1';
const ORDERS_KEY = 'ippa_orders_v1';

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  // Carrinho começa vazio de propósito (igual ao servidor, que nunca vê
  // localStorage) e só é lido de verdade no efeito abaixo, depois do
  // primeiro render — se lêssemos localStorage direto no useState (lazy
  // initializer), o cliente hidrataria com um valor diferente do HTML
  // vindo do servidor (que não tem acesso a localStorage) e React acusaria
  // hydration mismatch. O eslint-disable é porque essa regra normalmente
  // certa (evitar setState em efeito) não se aplica aqui: é exatamente
  // esse "atualiza só depois de montar" que evita o mismatch.
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setCartOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  // Frete escolhido no fluxo carrinho -> frete -> pagamento. É transitório
  // (diferente do carrinho, não precisa sobreviver a dias/reload).
  const [shipping, setShipping] = useState<ShippingOption | null>(null);

  // Talão de vendedora (ver TalaoProvider.tsx) — null pra qualquer cliente
  // final comprando (não tem o provider por perto) ou pra vendedora sem
  // sessão ativa selecionada. Com uma sessão ativa, o carrinho "de
  // verdade" passa a ser o pedido daquela cliente, não o pessoal — mesma
  // useCart() em ProductCard/ProductQuickView/ProductDetailContent, sem
  // precisar saber disso.
  const talao = useTalao();
  const activeSession = talao?.activeSession ?? null;

  const [catalogById, setCatalogById] = useState<Record<string, Product>>({});

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ver comentário acima do useState(cart)
    setCart(readJSON(CART_KEY, []));
    setHydrated(true);
  }, []);

  useEffect(() => {
    fetch('/api/catalog')
      .then((r) => (r.ok ? r.json() : []))
      .then((products: Product[]) => {
        setCatalogById(Object.fromEntries(products.map((p) => [p.id, p])));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart, hydrated]);

  function addToCart(product: Product, color: string, size: string, qty: number, stockQty?: number) {
    const key = [product.id, color, size].join('|');
    // Um item resolvido (cor+tamanho escolhidos) substitui o rascunho desse
    // produto, se existir — ver addDraft abaixo.
    const draftKey = `${product.id}|draft`;
    if (activeSession) {
      const base = activeSession.items.filter((i) => i.key !== draftKey);
      const existing = base.find((i) => i.key === key);
      const next = existing
        ? base.map((i) => (i.key === key ? { ...i, qty: i.qty + qty } : i))
        : [...base, { key, id: product.id, name: product.name, image: product.image, color, size, price: product.price, qty, stockQty }];
      talao!.updateActiveItems(next);
      return;
    }
    setCart((prev) => {
      const base = prev.filter((i) => i.key !== draftKey);
      const existing = base.find((i) => i.key === key);
      if (existing) {
        return base.map((i) => (i.key === key ? { ...i, qty: i.qty + qty } : i));
      }
      return [
        ...base,
        { key, id: product.id, name: product.name, image: product.image, color, size, price: product.price, qty, stockQty },
      ];
    });
  }

  function addDraft(product: Product) {
    const draftKey = `${product.id}|draft`;
    const base = activeSession ? activeSession.items : cart;
    if (base.some((i) => i.id === product.id)) return; // já tem rascunho ou item resolvido pra esse produto
    const draft: CartItem = { key: draftKey, id: product.id, name: product.name, image: product.image, price: product.price, qty: 0 };
    if (activeSession) {
      talao!.updateActiveItems([...base, draft]);
      return;
    }
    setCart((prev) => [...prev, draft]);
  }

  function removeProduct(productId: string) {
    if (activeSession) {
      talao!.updateActiveItems(activeSession.items.filter((i) => i.id !== productId));
      return;
    }
    setCart((prev) => prev.filter((i) => i.id !== productId));
  }

  function changeQty(key: string, qty: number) {
    if (activeSession) {
      talao!.updateActiveItems(activeSession.items.map((i) => (i.key === key ? { ...i, qty } : i)));
      return;
    }
    setCart((prev) => prev.map((i) => (i.key === key ? { ...i, qty } : i)));
  }

  function removeFromCart(key: string) {
    if (activeSession) {
      talao!.updateActiveItems(activeSession.items.filter((i) => i.key !== key));
      return;
    }
    setCart((prev) => prev.filter((i) => i.key !== key));
  }

  // `date: null` limpa a previsão escolhida (ex.: se a qty voltar pra
  // dentro do estoque depois de um decrement).
  function setBackorderDate(key: string, date: string | null) {
    if (activeSession) {
      talao!.updateActiveItems(
        activeSession.items.map((i) => (i.key === key ? { ...i, backorderDate: date ?? undefined } : i))
      );
      return;
    }
    setCart((prev) =>
      prev.map((i) => (i.key === key ? { ...i, backorderDate: date ?? undefined } : i))
    );
  }

  function clearCart() {
    if (activeSession) {
      talao!.updateActiveItems([]);
      return;
    }
    setCart([]);
  }

  function clearShipping() {
    setShipping(null);
  }

  function saveOrderToHistory(items: CartItem[], total: number, extra: Record<string, unknown> = {}): Order {
    const order: Order = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date: new Date().toISOString(),
      items,
      total,
      channel: 'whatsapp',
      ...extra,
    };
    const orders = readJSON<Order[]>(ORDERS_KEY, []);
    window.localStorage.setItem(ORDERS_KEY, JSON.stringify([order, ...orders]));
    return order;
  }

  const effectiveCart = activeSession ? activeSession.items : cart;
  const cartCount = effectiveCart.reduce((sum, item) => sum + item.qty, 0);
  const cartTotal = effectiveCart.reduce((sum, item) => sum + item.price * item.qty, 0);

  const value = useMemo(
    () => ({
      cart: effectiveCart,
      cartCount,
      cartTotal,
      isCartOpen,
      openCart: () => setCartOpen(true),
      closeCart: () => setCartOpen(false),
      addToCart,
      addDraft,
      removeProduct,
      changeQty,
      removeFromCart,
      setBackorderDate,
      clearCart,
      saveOrderToHistory,
      shipping,
      setShipping,
      clearShipping,
      catalogById,
    }),
    [effectiveCart, cartCount, cartTotal, isCartOpen, shipping, catalogById]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart precisa estar dentro de <CartProvider>');
  return ctx;
}

export function readOrders(): Order[] {
  return readJSON<Order[]>(ORDERS_KEY, []);
}
