'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const CartContext = createContext(null);
const CART_KEY = 'ippa_cart_v1';
const ORDERS_KEY = 'ippa_orders_v1';

function readJSON(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function CartProvider({ children }) {
  const [cart, setCart] = useState([]);
  const [isCartOpen, setCartOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  // Frete escolhido no fluxo carrinho -> frete -> pagamento. É transitório
  // (diferente do carrinho, não precisa sobreviver a dias/reload).
  const [shipping, setShipping] = useState(null);

  // Carrinho vive no localStorage pra sobreviver a navegação entre páginas
  // (catálogo -> detalhe do produto -> meus pedidos) e a reload, já que hoje
  // não existe backend de pedidos (isso é Fase 2, via Bippa/ERP).
  useEffect(() => {
    setCart(readJSON(CART_KEY, []));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart, hydrated]);

  function addToCart(product, color, size, qty) {
    const key = [product.id, color, size].join('|');
    setCart((prev) => {
      const existing = prev.find((i) => i.key === key);
      if (existing) {
        return prev.map((i) => (i.key === key ? { ...i, qty: i.qty + qty } : i));
      }
      return [
        ...prev,
        { key, id: product.id, name: product.name, image: product.image, color, size, price: product.price, qty },
      ];
    });
  }

  function changeQty(key, qty) {
    setCart((prev) => prev.map((i) => (i.key === key ? { ...i, qty } : i)));
  }

  function removeFromCart(key) {
    setCart((prev) => prev.filter((i) => i.key !== key));
  }

  function clearCart() {
    setCart([]);
  }

  function clearShipping() {
    setShipping(null);
  }

  function saveOrderToHistory(items, total, extra = {}) {
    const order = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date: new Date().toISOString(),
      items,
      total,
      channel: 'whatsapp',
      ...extra,
    };
    const orders = readJSON(ORDERS_KEY, []);
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

export function readOrders() {
  return readJSON(ORDERS_KEY, []);
}
