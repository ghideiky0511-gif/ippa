'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatBRL } from '@/lib/format';
import { CONFIG } from '@/lib/config';
import { useCart } from '@/components/CartProvider';
import CartRows from '@/components/CartRows';
import CheckoutSteps from '@/components/CheckoutSteps';
import UnselectedItemsModal from '@/components/UnselectedItemsModal';
import SimilarProducts from '@/components/SimilarProducts';
import type { CartItem, Product } from '@/lib/types';

// Peças que estão no carrinho mas com qty 0 em todo mundo (rascunho nunca
// resolvido, ou grade zerada — ver decrement em CartRows.tsx, que agora
// mantém a peça no carrinho em vez de sumir sozinha) — soma por produto
// porque uma peça pode ter várias linhas (cores/tamanhos diferentes).
function unselectedProductNames(cart: CartItem[]): string[] {
  const totals: Record<string, { name: string; qty: number }> = {};
  for (const item of cart) {
    if (!totals[item.id]) totals[item.id] = { name: item.name, qty: 0 };
    totals[item.id].qty += item.qty;
  }
  return Object.values(totals)
    .filter((t) => t.qty === 0)
    .map((t) => t.name);
}

export default function CarrinhoPage() {
  const router = useRouter();
  const { cart, cartCount, cartSubtotal, cartDiscountLabel, cartDiscountTotal, cartTotal, clearCart, saveOrderToHistory, shipping } = useCart();
  const [pendingAction, setPendingAction] = useState<{ names: string[]; run: () => void } | null>(null);
  const [similar, setSimilar] = useState<Product[]>([]);

  // Ids distintos dos produtos já resolvidos no carrinho (rascunho sem
  // grade/qty 0 não conta) — âncoras da regra de "produtos similares" do
  // carrinho (ver web/src/lib/similarProducts.ts).
  const cartProductIds = useMemo(
    () => Array.from(new Set(cart.filter((i) => i.qty > 0).map((i) => i.id))),
    [cart]
  );
  const cartProductIdsKey = cartProductIds.join(',');

  useEffect(() => {
    if (cartProductIds.length === 0) {
      setSimilar([]);
      return;
    }
    let cancelled = false;
    fetch('/api/similar-products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: 'cart', productIds: cartProductIds }),
    })
      .then((r) => (r.ok ? r.json() : { products: [] }))
      .then((data) => {
        if (!cancelled) setSimilar(data.products || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cartProductIdsKey já resume cartProductIds pra evitar refetch por mudança de referência sem mudança de conteúdo
  }, [cartProductIdsKey]);

  function sendWhatsapp() {
    if (!CONFIG.whatsappNumber) {
      alert('Configure CONFIG.whatsappNumber em src/lib/config.js com o número da loja para habilitar o envio direto.');
      return;
    }
    const resolvedItems = cart.filter((item) => item.qty > 0);
    const lines = [`Olá! Gostaria de fazer o seguinte pedido no ${CONFIG.storeName}:`, ''];
    resolvedItems.forEach((item) => {
      const variantParts = [item.color, item.size].filter(Boolean);
      const variantText = variantParts.length ? ` (${variantParts.join(' / ')})` : '';
      lines.push(`• ${item.qty}x ${item.name}${variantText} — ${formatBRL(item.price * item.qty)}`);
    });
    if (cartDiscountTotal > 0) {
      lines.push('', `Desconto (${cartDiscountLabel}): -${formatBRL(cartDiscountTotal)}`);
    }
    lines.push('', `Total: ${formatBRL(cartTotal)}`);
    const msg = encodeURIComponent(lines.join('\n'));
    window.open(`https://wa.me/${CONFIG.whatsappNumber}?text=${msg}`, '_blank');
    saveOrderToHistory(resolvedItems, cartTotal, {
      discount: cartDiscountTotal > 0 ? { label: cartDiscountLabel!, amount: cartDiscountTotal } : undefined,
    });
    clearCart();
  }

  function checkoutWhatsapp() {
    if (cartCount === 0) {
      alert('Seu carrinho está vazio — adicione peças e escolha a grade antes de continuar.');
      return;
    }
    const names = unselectedProductNames(cart);
    if (names.length > 0) {
      setPendingAction({ names, run: sendWhatsapp });
      return;
    }
    sendWhatsapp();
  }

  function goToFrete() {
    const names = unselectedProductNames(cart);
    if (names.length > 0) {
      setPendingAction({ names, run: () => router.push('/frete') });
      return;
    }
    router.push('/frete');
  }

  const reachable = shipping ? 3 : cartCount > 0 ? 2 : 1;

  return (
    <main className="container checkout-page">
      <CheckoutSteps current="/carrinho" reachable={reachable} />
      <h1>Seu carrinho</h1>

      <div className="checkout-items">
        <CartRows cart={cart} />
      </div>

      {cart.length > 0 && (
        <>
          <div className="checkout-summary">
            <div className="order-summary-line">
              <span>Subtotal</span>
              <span>{formatBRL(cartSubtotal)}</span>
            </div>
            {cartDiscountTotal > 0 && (
              <div className="order-summary-line discount">
                <span>Desconto ({cartDiscountLabel})</span>
                <span>-{formatBRL(cartDiscountTotal)}</span>
              </div>
            )}
            <div className="order-summary-line total">
              <span>Total</span>
              <span>{formatBRL(cartTotal)}</span>
            </div>
          </div>

          <div className="checkout-actions">
            <button className="btn-whatsapp" onClick={checkoutWhatsapp}>Finalizar pedido via WhatsApp</button>
            <button className="btn-add" disabled={cartCount === 0} onClick={goToFrete}>
              Continuar para o frete
            </button>
          </div>
        </>
      )}

      <SimilarProducts products={similar} />

      <Link href="/" className="back-link">← Voltar ao catálogo</Link>

      {pendingAction && (
        <UnselectedItemsModal
          names={pendingAction.names}
          onContinue={() => {
            const run = pendingAction.run;
            setPendingAction(null);
            run();
          }}
          onReview={() => setPendingAction(null)}
        />
      )}
    </main>
  );
}
