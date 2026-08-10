'use client';

import { useRouter } from 'next/navigation';
import { formatBRL } from '@/lib/format';
import { CONFIG } from '@/lib/config';
import { useCart } from './CartProvider';
import GroupedCartItems from './GroupedCartItems';

export default function CartDrawer() {
  const router = useRouter();
  const { cart, cartCount, cartSubtotal, cartDiscountLabel, cartDiscountTotal, cartTotal, isCartOpen, closeCart, clearCart, saveOrderToHistory } = useCart();

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

  function goToCheckout() {
    closeCart();
    router.push('/carrinho');
  }

  return (
    <>
      <div className={'cart-overlay' + (isCartOpen ? ' open' : '')} onClick={closeCart} />
      <aside className={'cart-drawer' + (isCartOpen ? ' open' : '')}>
        <div className="cart-header">
          <h2>Seu pedido</h2>
          <button aria-label="Fechar" onClick={closeCart}>&times;</button>
        </div>
        <div className="cart-items">
          {cart.length === 0 ? (
            <div className="cart-empty">Seu carrinho está vazio.</div>
          ) : (
            <GroupedCartItems cart={cart} />
          )}
        </div>
        <div className="cart-footer">
          {cartDiscountTotal > 0 && (
            <>
              <div className="cart-total subtotal"><span>Subtotal</span><span>{formatBRL(cartSubtotal)}</span></div>
              <div className="cart-total discount">
                <span>Desconto ({cartDiscountLabel})</span>
                <span>-{formatBRL(cartDiscountTotal)}</span>
              </div>
            </>
          )}
          <div className="cart-total"><span>Total</span><span>{formatBRL(cartTotal)}</span></div>
          <button className="btn-whatsapp" onClick={checkoutWhatsapp}>Finalizar pedido via WhatsApp</button>
          <button className="btn-site-checkout" onClick={goToCheckout}>Revisar e continuar no site</button>
          <div className="whatsapp-hint">Ao enviar pelo WhatsApp, nada é cobrado automaticamente. Entre ou crie uma conta pra ver esse pedido depois em "Meus pedidos".</div>
        </div>
      </aside>
    </>
  );
}
