'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatBRL } from '@/lib/format';
import { CONFIG } from '@/lib/config';
import { useCart } from '@/components/CartProvider';
import GroupedCartItems from '@/components/GroupedCartItems';
import CheckoutSteps from '@/components/CheckoutSteps';

export default function CarrinhoPage() {
  const router = useRouter();
  const { cart, cartCount, cartTotal, clearCart, saveOrderToHistory, shipping } = useCart();

  function checkoutWhatsapp() {
    if (cartCount === 0) {
      alert('Seu carrinho está vazio — adicione peças e escolha a grade antes de continuar.');
      return;
    }
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
    lines.push('', `Total: ${formatBRL(cartTotal)}`);
    const msg = encodeURIComponent(lines.join('\n'));
    window.open(`https://wa.me/${CONFIG.whatsappNumber}?text=${msg}`, '_blank');
    saveOrderToHistory(resolvedItems, cartTotal);
    clearCart();
  }

  const reachable = shipping ? 3 : cartCount > 0 ? 2 : 1;

  return (
    <main className="container checkout-page">
      <CheckoutSteps current="/carrinho" reachable={reachable} />
      <h1>Seu carrinho</h1>

      {cart.length === 0 ? (
        <div className="cart-empty">
          Seu carrinho está vazio. <Link href="/">Ver catálogo</Link>
        </div>
      ) : (
        <>
          <div className="checkout-items">
            <GroupedCartItems cart={cart} />
          </div>

          <div className="checkout-summary">
            <div className="order-summary-line">
              <span>Subtotal</span>
              <span>{formatBRL(cartTotal)}</span>
            </div>
          </div>

          <div className="checkout-actions">
            <button className="btn-whatsapp" onClick={checkoutWhatsapp}>Finalizar pedido via WhatsApp</button>
            <button className="btn-add" disabled={cartCount === 0} onClick={() => router.push('/frete')}>
              Continuar para o frete
            </button>
          </div>
        </>
      )}

      <Link href="/" className="back-link">← Voltar ao catálogo</Link>
    </main>
  );
}
