'use client';
import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useTalao } from './TalaoProvider';
import { useClientSession } from './ClientSessionProvider';
import { useAuthUser } from './AuthProvider';
import { getCartDiscount, type AppliedDiscount } from '@/lib/discounts';
import {
  CreateCustomerOrderInputSchema,
  OrderSchema,
  type CartItem,
  type CreateCustomerOrderInput,
  type ShippingOption,
} from '@/domain/orders/types';
import { DiscountSchema, type Discount } from '@/domain/catalog/types';
import { ProductSchema, type Product } from '@/domain/products/types';
import { z } from 'zod';
import { adminJson } from '@/lib/http';

type OrderSubmissionExtra = Omit<Partial<CreateCustomerOrderInput>, 'items' | 'total' | 'sessionId'>;

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
    backorderDate?: string,
    suggested?: boolean
  ) => void;
  // Guarda o produto no carrinho sem comprometer cor/tamanho. A grade é
  // escolhida depois, a partir do item marcado como "Selecione a grade".
  // `suggested` marca a peça como sugestão da vendedora (ver ProductCard.tsx).
  addProductDraft: (product: Product, suggested?: boolean) => void;
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
  saveOrderToHistory: (items: CartItem[], total: number, extra?: OrderSubmissionExtra) => Promise<void>;
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
  // Sem atendimento ativo, a cliente monta o próprio carrinho e conclui o
  // checkout direto. A sessão remota continua sendo a fonte de verdade só
  // quando uma vendedora assumiu o atendimento.
  const [personalCart, setPersonalCart] = useState<CartItem[]>([]);
  const [personalShipping, setPersonalShipping] = useState<ShippingOption | null>(null);
  const customerSessionCreation = useRef(false);
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

  const shipping = activeSession?.shipping ?? personalShipping;

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

  // Enquanto a sessão atribuída está sendo criada, o carrinho local absorve
  // cliques sucessivos. Assim que o atendimento existe, ele recebe o estado
  // mais recente sem bloquear a cliente.
  useEffect(() => {
    if (!clientOpen || personalCart.length === 0) return;
    void clientOpen.updateActiveItems(personalCart).then(() => setPersonalCart([]));
  }, [clientOpen, personalCart]);

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
    if (authUserCtx.authUser?.role === 'cliente' && clientSession) {
      setPersonalCart(items);
      if (!customerSessionCreation.current) {
        customerSessionCreation.current = true;
        void clientSession.createActiveSession(items).finally(() => {
          customerSessionCreation.current = false;
        });
      }
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
    backorderDate?: string,
    suggested?: boolean
  ) {
    const key = [product.id, color, size].join('|');
    function apply(base: CartItem[]): CartItem[] {
      const existing = base.find((i) => i.key === key);
      if (existing) {
        return base.map((i) =>
          i.key === key
            ? { ...i, qty: i.qty + qty, backorderDate: backorderDate ?? i.backorderDate, suggested: suggested || i.suggested }
            : i
        );
      }
      return [
        ...base,
        { key, id: product.id, name: product.name, image: product.image, color, size, price: product.price, qty, stockQty, backorderDate, suggested },
      ];
    }
    updateItems(apply(activeSession?.items ?? personalCart));
  }

  function addProductDraft(product: Product, suggested?: boolean) {
    // Cor e tamanho vazios identificam um rascunho no contrato do carrinho.
    // A quantidade fica em zero até a cliente definir a grade.
    addToCart(product, '', '', 0, undefined, undefined, suggested);
  }

  function removeProduct(productId: string) {
    updateItems((activeSession?.items ?? personalCart).filter((i) => i.id !== productId));
  }

  function changeQty(key: string, qty: number) {
    updateItems((activeSession?.items ?? personalCart).map((i) => (i.key === key ? { ...i, qty } : i)));
  }

  function removeFromCart(key: string) {
    updateItems((activeSession?.items ?? personalCart).filter((i) => i.key !== key));
  }

  // `date: null` limpa a previsão escolhida (ex.: se a qty voltar pra
  // dentro do estoque depois de um decrement).
  function setBackorderDate(key: string, date: string | null) {
    updateItems(
      (activeSession?.items ?? personalCart).map((i) => (i.key === key ? { ...i, backorderDate: date ?? undefined } : i))
    );
  }

  function setBackorderDateForKeys(keys: string[], date: string | null) {
    const keySet = new Set(keys);
    updateItems((activeSession?.items ?? personalCart).map((i) => (keySet.has(i.key) ? { ...i, backorderDate: date ?? undefined } : i)));
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
    updateItems(mergeItems((activeSession?.items ?? personalCart).filter((i) => !removeSet.has(i.key)), addItems));
  }

  function clearCart() {
    updateItems([]);
  }

  function setShipping(next: ShippingOption | null) {
    if (activeSession) {
      void sessionActions!.updateActiveShipping(next);
      return;
    }
    if (authUserCtx.authUser?.role === 'cliente') setPersonalShipping(next);
  }

  function clearShipping() {
    setShipping(null);
  }

  // Confirma primeiro no backend e só então limpa o estado local. Antes, o
  // POST era fire-and-forget e `clearCart()` enviava `items: []` em paralelo;
  // dependendo da ordem das transações, isso apagava order_items do pedido.
  async function saveOrderToHistory(items: CartItem[], total: number, extra: OrderSubmissionExtra = {}): Promise<void> {
    const sessionId = clientSession?.activeSession?.id;
    if (authUserCtx.authUser?.role === 'cliente') {
      const payload = CreateCustomerOrderInputSchema.parse({
        items,
        total,
        channel: 'whatsapp',
        ...extra,
        sessionId,
      });
      await adminJson('/api/orders', OrderSchema, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }, 'Não foi possível confirmar o pedido. Seu carrinho foi preservado.');

      if (sessionId) clientSession?.releaseActiveSession(sessionId);
      setPersonalCart([]);
      setPersonalShipping(null);
      return;
    }

    // Visitante finalizando externamente pelo WhatsApp: só existe estado
    // local. Num talão gerenciado pela vendedora, preservar os itens; limpar
    // ali seria uma mutação real do pedido, não uma simples limpeza de UI.
    if (!activeSession) {
      setPersonalCart([]);
      setPersonalShipping(null);
    }
  }

  const effectiveCart = activeSession ? activeSession.items : personalCart;
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
      addProductDraft,
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
