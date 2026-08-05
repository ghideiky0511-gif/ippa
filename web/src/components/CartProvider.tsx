'use client';

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import type { CartItem, Order, Product, ShippingOption } from '@/lib/types';

interface CartContextValue {
  cart: CartItem[];
  cartCount: number;
  cartTotal: number;
  isCartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  addToCart: (product: Product, color: string, size: string, qty: number, stockQty?: number) => void;
  changeQty: (key: string, qty: number) => void;
  removeFromCart: (key: string) => void;
  setBackorderDate: (key: string, date: string | null) => void;
  clearCart: () => void;
  saveOrderToHistory: (items: CartItem[], total: number, extra?: Record<string, unknown>) => Order;
  shipping: ShippingOption | null;
  setShipping: (shipping: ShippingOption | null) => void;
  clearShipping: () => void;
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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ver comentário acima do useState(cart)
    setCart(readJSON(CART_KEY, []));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart, hydrated]);

  function addToCart(product: Product, color: string, size: string, qty: number, stockQty?: number) {
    const key = [product.id, color, size].join('|');
    setCart((prev) => {
      const existing = prev.find((i) => i.key === key);
      if (existing) {
        return prev.map((i) => (i.key === key ? { ...i, qty: i.qty + qty } : i));
      }
      return [
        ...prev,
        { key, id: product.id, name: product.name, image: product.image, color, size, price: product.price, qty, stockQty },
      ];
    });
  }

  function changeQty(key: string, qty: number) {
    setCart((prev) => prev.map((i) => (i.key === key ? { ...i, qty } : i)));
  }

  function removeFromCart(key: string) {
    setCart((prev) => prev.filter((i) => i.key !== key));
  }

  // `date: null` limpa a previsão escolhida (ex.: se a qty voltar pra
  // dentro do estoque depois de um decrement).
  function setBackorderDate(key: string, date: string | null) {
    setCart((prev) =>
      prev.map((i) => (i.key === key ? { ...i, backorderDate: date ?? undefined } : i))
    );
  }

  function clearCart() {
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

  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);
  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  const value = useMemo(
    () => ({
      cart,
      cartCount,
      cartTotal,
      isCartOpen,
      openCart: () => setCartOpen(true),
      closeCart: () => setCartOpen(false),
      addToCart,
      changeQty,
      removeFromCart,
      setBackorderDate,
      clearCart,
      saveOrderToHistory,
      shipping,
      setShipping,
      clearShipping,
    }),
    [cart, cartCount, cartTotal, isCartOpen, shipping]
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
