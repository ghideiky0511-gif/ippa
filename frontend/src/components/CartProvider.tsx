'use client';
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useTalao } from './TalaoProvider';
import { useClientSession } from './ClientSessionProvider';
import { useAuthUser } from './AuthProvider';
import { getCartDiscount, type AppliedDiscount } from '@/lib/discounts';
import { type CartItem, type Order, type ShippingOption } from '@/domain/orders/types';
import { DiscountSchema, type Discount } from '@/domain/catalog/types';
import { ProductSchema, type Product } from '@/domain/products/types';
import { z } from 'zod';

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
  // Tira todas as linhas daquele produto do pedido.
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
  saveOrderToHistory: (items: CartItem[], total: number, extra?: Record<string, unknown>) => Omit<Order, 'status'>;
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
export function CartProvider({ children }: { children: ReactNode }) {
  // O pedido remoto é a única fonte de verdade; não há estado persistente no navegador.
  const cart: CartItem[] = [];
  const [isCartOpen, setCartOpen] = useState(false);
  const authUserCtx = useAuthUser();

  // Há uma única fonte de itens: a sessão selecionada pela vendedora ou a
  // única sessão online aberta da cliente.
  const talao = useTalao();
  const clientSession = useClientSession();
  // Sessão 'fechado' não conta mais como "carrinho compartilhado ativo"
  // aqui — sem isso, depois que a cliente paga pelo link (ou a vendedora
  // fecha manualmente), o carrinho/drawer continuava mostrando os itens de
  // um pedido que já acabou, porque a vendedora não desmarca a sessão
  // sozinha (achado reportado pelo usuário: "depois da compra finalizada,
  // na tela da vendedora o carrinho ainda está aparecendo como estava
  // antes"). 'aguardando_pagamento' continua contando (ainda dá pra ver o
  // que tem no pedido enquanto espera a cliente pagar). /frete continua
  // lendo useTalao() direto (sem esse filtro) pra mostrar a confirmação de
  // pagamento mesmo depois de fechar — só o carrinho exposto aqui muda.
  const talaoOpen = talao?.activeSession && talao.activeSession.status !== 'fechado' && talao.activeSession.status !== 'cancelado' ? talao : null;
  const clientOpen = clientSession?.activeSession && clientSession.activeSession.status !== 'fechado' && clientSession.activeSession.status !== 'cancelado' ? clientSession : null;
  const sessionActions = talaoOpen || clientOpen;
  const activeSession = sessionActions?.activeSession ?? null;

  const shipping = activeSession?.shipping ?? null;

  const [catalogById, setCatalogById] = useState<Record<string, Product>>({});
  const [discounts, setDiscounts] = useState<Discount[]>([]);

  useEffect(() => {
    fetch('/api/catalog')
      .then((r) => (r.ok ? r.json() : []))
      .then((json) => {
        const parsed = z.array(ProductSchema).safeParse(json);
        const products = parsed.success ? parsed.data : [];
        setCatalogById(Object.fromEntries(products.map((p) => [p.id, p])));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/discounts')
      .then((r) => (r.ok ? r.json() : []))
      .then((json) => {
        const parsed = z.array(DiscountSchema).safeParse(json);
        setDiscounts(parsed.success ? parsed.data : []);
      })
      .catch(() => {});
  }, []);

  function updateItems(items: CartItem[]): void {
    if (activeSession) {
      void sessionActions!.updateActiveItems(items);
      return;
    }
    // TODO(configuração): quando /workspace/ferramentas expuser
    // `allowPublicCart`, esta guarda deverá consultar a flag antes de criar
    // uma sessão para visitante. No MVP, somente cliente autenticada cria o
    // carrinho remoto.
    if (authUserCtx.authUser?.role === 'cliente' && clientSession) {
      void clientSession.createActiveSession(items);
      return;
    }
    toast.info(authUserCtx.authUser?.role === 'vendedora'
      ? 'Selecione ou crie um pedido no talão antes de adicionar itens.'
      : 'Entre na sua conta para criar um pedido.');
  }

  function addToCart(
    product: Product,
    color: string,
    size: string,
    qty: number,
    stockQty?: number,
    backorderDate?: string
  ) {
    const key = [product.id, color, size].join('|');
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
    updateItems(apply(activeSession?.items ?? []));
  }

  function removeProduct(productId: string) {
    updateItems((activeSession?.items ?? []).filter((i) => i.id !== productId));
  }

  function changeQty(key: string, qty: number) {
    updateItems((activeSession?.items ?? []).map((i) => (i.key === key ? { ...i, qty } : i)));
  }

  function removeFromCart(key: string) {
    updateItems((activeSession?.items ?? []).filter((i) => i.key !== key));
  }

  // `date: null` limpa a previsão escolhida (ex.: se a qty voltar pra
  // dentro do estoque depois de um decrement).
  function setBackorderDate(key: string, date: string | null) {
    updateItems(
      (activeSession?.items ?? []).map((i) => (i.key === key ? { ...i, backorderDate: date ?? undefined } : i))
    );
  }

  function setBackorderDateForKeys(keys: string[], date: string | null) {
    const keySet = new Set(keys);
    updateItems((activeSession?.items ?? []).map((i) => (keySet.has(i.key) ? { ...i, backorderDate: date ?? undefined } : i)));
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
    updateItems(mergeItems((activeSession?.items ?? []).filter((i) => !removeSet.has(i.key)), addItems));
  }

  function clearCart() {
    updateItems([]);
  }

  function setShipping(next: ShippingOption | null) {
    if (activeSession) void sessionActions!.updateActiveShipping(next);
  }

  function clearShipping() {
    setShipping(null);
  }

  // "Meus pedidos" é sempre da conta autenticada; o histórico é gravado no
  // backend ao concluir o checkout.
  // Payload de saída pro POST /api/orders — sem `status` porque quem
  // decide o status real é o backend ao receber o pedido, nunca o
  // cliente (ver Order.status em backend/src/contracts/orders.ts).
  function saveOrderToHistory(items: CartItem[], total: number, extra: Record<string, unknown> = {}): Omit<Order, 'status'> {
    const order: Omit<Order, 'status'> = {
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
