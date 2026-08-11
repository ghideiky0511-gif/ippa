'use client';

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { useTalao } from './TalaoProvider';
import { useClientSession } from './ClientSessionProvider';
import { useAuthUser } from './AuthProvider';
import { getCartDiscount, type AppliedDiscount } from '@/lib/discounts';
import type { CartItem, Discount, Order, Product, ShippingOption } from '@/lib/types';

interface CartContextValue {
  cart: CartItem[];
  cartCount: number;
  cartSubtotal: number; // soma bruta, antes do desconto (ver cartDiscountTotal)
  // Descontos aplicados ao carrinho — cada produto tem seu próprio melhor
  // desconto (nunca soma nem herda de outro produto do carrinho, ver
  // getCartDiscount em web/src/lib/discounts.ts). cartDiscountByProduct é
  // usado pra mostrar risco/valor com desconto na linha da peça
  // (GroupedCartItems.tsx, CartRows.tsx); cartDiscountLabel/cartDiscountTotal
  // resumem pro resumo do pedido (/carrinho, /frete, /pagamento, WhatsApp).
  cartDiscountByProduct: Record<string, AppliedDiscount>;
  cartDiscountLabel: string | null;
  cartDiscountTotal: number;
  cartTotal: number; // cartSubtotal - cartDiscountTotal — é o valor de verdade cobrado (usado em WhatsApp, /frete, /pagamento, histórico de pedido)
  // Descontos cadastrados (/descontos), crus — expostos pra quem precisa
  // derivar algo além do melhor-desconto-do-carrinho (ex.: ProductDetailContent
  // mostrando as faixas de "por quantidade" mesmo antes de bater, ver
  // getQuantityDiscountTiers em web/src/lib/discounts.ts). Evita um segundo
  // fetch de /api/discounts em cada lugar que precisa disso.
  discounts: Discount[];
  isCartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  // `backorderDate` opcional: aplica essa previsão de entrega ao item novo
  // (ou já existente, se for um incremento) — usado pela grade inline do
  // carrinho (CartRows.tsx), que deixa escolher a entrega da linha antes
  // mesmo de incrementar alguma quantidade. Sem isso, o item mantém o que
  // já tinha (ou nenhum, comportamento de sempre).
  addToCart: (
    product: Product,
    color: string,
    size: string,
    qty: number,
    stockQty?: number,
    backorderDate?: string
  ) => void;
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
  // Aplica a mesma previsão de entrega a várias linhas de uma vez (usado
  // pelo seletor de entrega por linha do carrinho — CartRows.tsx — que
  // mexe em todos os tamanhos de uma cor junto, não um item por vez).
  setBackorderDateForKeys: (keys: string[], date: string | null) => void;
  // Tira `removeKeys` e acrescenta `addItems` numa operação só (em vez de
  // várias chamadas de removeFromCart/addToCart em sequência, que perderiam
  // update com sessão de talão ativa — cada chamada isolada leria
  // `activeSession.items` desatualizado do closure). Usado por CartRows.tsx
  // pra trocar a cor de uma linha inteira, restaurar depois de um
  // "desfazer" e apagar uma linha (removeKeys sem addItems).
  replaceItems: (removeKeys: string[], addItems: CartItem[]) => void;
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
  // Frete escolhido no fluxo carrinho -> frete -> pagamento. Pra compra
  // pessoal continua transitório (não precisa sobreviver a dias/reload) —
  // mas com uma sessão de talão ativa também é persistido nela (ver
  // useEffect e setShipping/clearShipping abaixo), porque a vendedora
  // escolhe o frete e depois entrega o resto pra cliente terminar via link
  // de pagamento (ver requestPaymentLink em TalaoProvider.tsx) — precisa
  // sobreviver a ela sair da tela.
  const [shipping, setShippingState] = useState<ShippingOption | null>(null);
  const authUserCtx = useAuthUser();

  // Duas fontes possíveis de "pedido compartilhado", nunca as duas ao mesmo
  // tempo (um só provider é montado por role, ver AppShell.tsx): talão da
  // vendedora (TalaoProvider.tsx) ou a sessão atribuída da própria cliente
  // logada (ClientSessionProvider.tsx — o que faz o carrinho dela virar de
  // fato o mesmo pedido que a vendedora está montando, em vez de dois
  // carrinhos desconectados). `sessionActions` é o objeto certo pra chamar
  // updateActiveItems/updateActiveShipping; `activeSession` é só o dado.
  // null pra cliente final sem sessão atribuída, ou vendedora sem sessão
  // ativa selecionada — nesses casos o carrinho "de verdade" continua o
  // pessoal (localStorage), mesma useCart() em
  // ProductCard/ProductQuickView/ProductDetailContent, sem precisar saber
  // de nada disso.
  const talao = useTalao();
  const clientSession = useClientSession();
  const sessionActions = talao?.activeSession ? talao : clientSession?.activeSession ? clientSession : null;
  const activeSession = sessionActions?.activeSession ?? null;

  // Hidrata o frete local a partir do que já estava salvo na sessão (ex.:
  // vendedora saiu de /frete e voltou, ou trocou de sessão ativa no talão)
  // — sem isso o campo local ficaria sempre null até ela escolher de novo.
  useEffect(() => {
    if (activeSession) setShippingState(activeSession.shipping || null);
  }, [activeSession?.id, activeSession?.shipping]);

  const [catalogById, setCatalogById] = useState<Record<string, Product>>({});
  const [discounts, setDiscounts] = useState<Discount[]>([]);

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
    fetch('/api/discounts')
      .then((r) => (r.ok ? r.json() : []))
      .then(setDiscounts)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart, hydrated]);

  // Espelha o carrinho pessoal no cadastro da cliente logada — só captura
  // de dado (Client.cart em types.ts), não afeta o que aparece na tela (a
  // exibição continua vindo do localStorage acima). Fire-and-forget, mesmo
  // espírito dos outros syncs deste arquivo.
  useEffect(() => {
    if (!hydrated) return;
    const clientId = authUserCtx.authUser?.role === 'cliente' ? authUserCtx.authUser.clientId : undefined;
    if (!clientId) return;
    fetch(`/api/clients/${clientId}/cart`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cart }),
    }).catch(() => {});
  }, [cart, hydrated, authUserCtx.authUser]);

  function addToCart(
    product: Product,
    color: string,
    size: string,
    qty: number,
    stockQty?: number,
    backorderDate?: string
  ) {
    const key = [product.id, color, size].join('|');
    // Um item resolvido (cor+tamanho escolhidos) substitui o rascunho desse
    // produto, se existir — ver addDraft abaixo.
    const draftKey = `${product.id}|draft`;
    function apply(base: CartItem[]): CartItem[] {
      const existing = base.find((i) => i.key === key);
      if (existing) {
        return base.map((i) =>
          i.key === key ? { ...i, qty: i.qty + qty, backorderDate: backorderDate ?? i.backorderDate } : i
        );
      }
      return [
        ...base,
        { key, id: product.id, name: product.name, image: product.image, color, size, price: product.price, qty, stockQty, backorderDate },
      ];
    }
    if (activeSession) {
      sessionActions!.updateActiveItems(apply(activeSession.items.filter((i) => i.key !== draftKey)));
      return;
    }
    setCart((prev) => apply(prev.filter((i) => i.key !== draftKey)));
  }

  function addDraft(product: Product) {
    const draftKey = `${product.id}|draft`;
    const base = activeSession ? activeSession.items : cart;
    if (base.some((i) => i.id === product.id)) return; // já tem rascunho ou item resolvido pra esse produto
    const draft: CartItem = { key: draftKey, id: product.id, name: product.name, image: product.image, price: product.price, qty: 0 };
    if (activeSession) {
      sessionActions!.updateActiveItems([...base, draft]);
      return;
    }
    setCart((prev) => [...prev, draft]);
  }

  function removeProduct(productId: string) {
    if (activeSession) {
      sessionActions!.updateActiveItems(activeSession.items.filter((i) => i.id !== productId));
      return;
    }
    setCart((prev) => prev.filter((i) => i.id !== productId));
  }

  function changeQty(key: string, qty: number) {
    if (activeSession) {
      sessionActions!.updateActiveItems(activeSession.items.map((i) => (i.key === key ? { ...i, qty } : i)));
      return;
    }
    setCart((prev) => prev.map((i) => (i.key === key ? { ...i, qty } : i)));
  }

  function removeFromCart(key: string) {
    if (activeSession) {
      sessionActions!.updateActiveItems(activeSession.items.filter((i) => i.key !== key));
      return;
    }
    setCart((prev) => prev.filter((i) => i.key !== key));
  }

  // `date: null` limpa a previsão escolhida (ex.: se a qty voltar pra
  // dentro do estoque depois de um decrement).
  function setBackorderDate(key: string, date: string | null) {
    if (activeSession) {
      sessionActions!.updateActiveItems(
        activeSession.items.map((i) => (i.key === key ? { ...i, backorderDate: date ?? undefined } : i))
      );
      return;
    }
    setCart((prev) =>
      prev.map((i) => (i.key === key ? { ...i, backorderDate: date ?? undefined } : i))
    );
  }

  function setBackorderDateForKeys(keys: string[], date: string | null) {
    const keySet = new Set(keys);
    if (activeSession) {
      sessionActions!.updateActiveItems(
        activeSession.items.map((i) => (keySet.has(i.key) ? { ...i, backorderDate: date ?? undefined } : i))
      );
      return;
    }
    setCart((prev) => prev.map((i) => (keySet.has(i.key) ? { ...i, backorderDate: date ?? undefined } : i)));
  }

  // Junta `addItems` em cima do que sobrou depois de tirar `removeKeys` —
  // se algum item de `addItems` cair numa key que já existe no que sobrou
  // (ex.: trocar a cor de uma linha pra uma cor que outra linha já usa),
  // soma a quantidade em vez de duplicar a linha no carrinho.
  function mergeItems(base: CartItem[], addItems: CartItem[]): CartItem[] {
    let result = base;
    for (const item of addItems) {
      const idx = result.findIndex((i) => i.key === item.key);
      if (idx === -1) {
        result = [...result, item];
      } else {
        const existing = result[idx];
        result = result.map((i, n) =>
          n === idx ? { ...existing, qty: existing.qty + item.qty, backorderDate: item.backorderDate ?? existing.backorderDate } : i
        );
      }
    }
    return result;
  }

  function replaceItems(removeKeys: string[], addItems: CartItem[]) {
    const removeSet = new Set(removeKeys);
    if (activeSession) {
      const base = activeSession.items.filter((i) => !removeSet.has(i.key));
      sessionActions!.updateActiveItems(mergeItems(base, addItems));
      return;
    }
    setCart((prev) => mergeItems(prev.filter((i) => !removeSet.has(i.key)), addItems));
  }

  function clearCart() {
    if (activeSession) {
      sessionActions!.updateActiveItems([]);
      return;
    }
    setCart([]);
  }

  function setShipping(next: ShippingOption | null) {
    setShippingState(next);
    if (activeSession) sessionActions!.updateActiveShipping(next);
  }

  function clearShipping() {
    setShipping(null);
  }

  // "Meus pedidos" é sempre da CONTA agora (ver GET/POST /api/orders,
  // web/src/app/pedidos/page.tsx) — sem login não existe pedido pra
  // mostrar, por isso não grava mais em localStorage aqui (fazia isso
  // antes da conta existir; sem ninguém lendo, um pedido salvo aqui só
  // vazava informação de compra pra "aparecer" mesmo deslogada, o que já
  // confundiu quem testou). Cliente sem login que finaliza (WhatsApp ou
  // /pagamento) tem o pedido enviado normalmente, só não fica salvo em
  // lugar nenhum além da própria mensagem de WhatsApp/confirmação na tela.
  function saveOrderToHistory(items: CartItem[], total: number, extra: Record<string, unknown> = {}): Order {
    const order: Order = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date: new Date().toISOString(),
      items,
      total,
      channel: 'whatsapp',
      ...extra,
    };
    // Fire-and-forget, mesmo espírito despreocupado dos outros fetches
    // deste arquivo — não trava o checkout se a rede falhar. `sessionId`
    // (só quando o carrinho vem de uma sessão de talão atribuída à própria
    // cliente, não da vendedora) deixa POST /api/orders resolver o
    // sellerId de quem atendeu e fechar aquela sessão — ver
    // ClientSessionProvider.tsx/AppShell.tsx pra por que só a cliente cai
    // nesse caminho (vendedora finaliza pelo link de pagamento, não por
    // aqui).
    if (authUserCtx.authUser?.role === 'cliente') {
      fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...order, sessionId: clientSession?.activeSession?.id }),
      }).catch(() => {});
    }
    return order;
  }

  const effectiveCart = activeSession ? activeSession.items : cart;
  const cartCount = effectiveCart.reduce((sum, item) => sum + item.qty, 0);
  const cartSubtotal = effectiveCart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const cartDiscount = useMemo(() => getCartDiscount(effectiveCart, discounts), [effectiveCart, discounts]);
  const cartTotal = cartSubtotal - cartDiscount.totalAmount;

  const value = useMemo(
    () => ({
      cart: effectiveCart,
      cartCount,
      cartSubtotal,
      cartDiscountByProduct: cartDiscount.byProduct,
      cartDiscountLabel: cartDiscount.label,
      cartDiscountTotal: cartDiscount.totalAmount,
      cartTotal,
      discounts,
      isCartOpen,
      openCart: () => setCartOpen(true),
      closeCart: () => setCartOpen(false),
      addToCart,
      addDraft,
      removeProduct,
      changeQty,
      removeFromCart,
      setBackorderDate,
      setBackorderDateForKeys,
      replaceItems,
      clearCart,
      saveOrderToHistory,
      shipping,
      setShipping,
      clearShipping,
      catalogById,
    }),
    [effectiveCart, cartCount, cartSubtotal, cartDiscount, cartTotal, discounts, isCartOpen, shipping, catalogById]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart precisa estar dentro de <CartProvider>');
  return ctx;
}
