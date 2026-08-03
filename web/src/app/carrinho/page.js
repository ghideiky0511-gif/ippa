'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatBRL } from '@/lib/format';
import { CONFIG } from '@/lib/config';
import { useCart } from '@/components/CartProvider';
import CartItemRow from '@/components/CartItemRow';
import CheckoutSteps from '@/components/CheckoutSteps';

export default function CarrinhoPage() {
  const router = useRouter();
  const { cart, cartTotal, changeQty, removeFromCart, clearCart, saveOrderToHistory, shipping } = useCart();

  function checkoutWhatsapp() {
    if (!CONFIG.whatsappNumber) {
      alert('Configure CONFIG.whatsappNumber em src/lib/config.js com o número da loja para habilitar o envio direto.');
      return;
    }
    const lines = [`Olá! Gostaria de fazer o seguinte pedido no ${CONFIG.storeName}:`, ''];
    cart.forEach((item) => {
      const variantParts = [item.color, item.size].filter(Boolean);
      const variantText = variantParts.length ? ` (${variantParts.join(' / ')})` : '';
      lines.push(`• ${item.qty}x ${item.name}${variantText} — ${formatBRL(item.price * item.qty)}`);
    });
    lines.push('', `Total: ${formatBRL(cartTotal)}`);
    const msg = encodeURIComponent(lines.join('\n'));
    window.open(`https://wa.me/${CONFIG.whatsappNumber}?text=${msg}`, '_blank');
    saveOrderToHistory(cart, cartTotal);
    clearCart();
  }

  const reachable = shipping ? 3 : cart.length > 0 ? 2 : 1;

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
            {cart.map((item) => (
              <CartItemRow key={item.key} item={item} onChangeQty={changeQty} onRemove={removeFromCart} />
            ))}
          </div>

          <div className="checkout-summary">
            <div className="order-summary-line">
              <span>Subtotal</span>
              <span>{formatBRL(cartTotal)}</span>
            </div>
          </div>

          <div className="checkout-actions">
            <button className="btn-whatsapp" onClick={checkoutWhatsapp}>Finalizar pedido via WhatsApp</button>
            <button className="btn-add" onClick={() => router.push('/frete')}>Continuar para o frete</button>
          </div>
        </>
      )}

      <Link href="/" className="back-link">← Voltar ao catálogo</Link>
    </main>
  );
}
