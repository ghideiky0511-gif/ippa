'use client';
import { publicUi } from '@/lib/ui';

import Link from '@/components/TenantLink';
import { useRouter } from 'next/navigation';
import { formatBRL } from '@/lib/format';
import { CONFIG } from '@/lib/config';
import { useCart } from './CartProvider';
import { useAuthUser } from './AuthProvider';
import GroupedCartItems from './GroupedCartItems';
import { useTenant } from './TenantProvider';

export default function CartDrawer() {
  const router = useRouter();
  const { cart, cartCount, cartSubtotal, cartDiscountLabel, cartDiscountTotal, cartTotal, isCartOpen, closeCart, clearCart, saveOrderToHistory } = useCart();
  const { showPrices } = useAuthUser();
  const { tenant, href } = useTenant();

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
    const lines = [`Olá! Gostaria de fazer o seguinte pedido no ${tenant.name}:`, ''];
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
    router.push(href('/carrinho'));
  }

  return (
    <>
      <div className={[publicUi.overlay, isCartOpen ? 'block' : 'hidden'].join(' ')} onClick={closeCart} />
      <aside className={[publicUi.drawerRight, isCartOpen ? 'translate-x-0' : ''].join(' ')}>
        <div className={publicUi.cartHeader}>
          <h2>Seu pedido</h2>
          <button aria-label="Fechar" onClick={closeCart}>&times;</button>
        </div>
        <div className={publicUi.cartItems}>
          {cart.length === 0 ? (
            <div className={publicUi.empty}>Seu carrinho está vazio.</div>
          ) : (
            <GroupedCartItems cart={cart} />
          )}
        </div>
        <div className={publicUi.cartFooter}>
          {!showPrices ? (
            <Link href="/login" className={publicUi.priceLocked}>Entrar para ver o preço</Link>
          ) : (
            <>
              {cartDiscountTotal > 0 && (
                <>
                  <div className={`${publicUi.cartTotal} font-normal`}><span>Subtotal</span><span>{formatBRL(cartSubtotal)}</span></div>
                  <div className={`${publicUi.cartTotal} font-normal text-[#2e8b57]`}>
                    <span>Desconto ({cartDiscountLabel})</span>
                    <span>-{formatBRL(cartDiscountTotal)}</span>
                  </div>
                </>
              )}
              <div className={publicUi.cartTotal}><span>Total</span><span>{formatBRL(cartTotal)}</span></div>
            </>
          )}
          <button className={publicUi.whatsapp} onClick={checkoutWhatsapp}>Finalizar pedido via WhatsApp</button>
          <button className={publicUi.checkoutButton} onClick={goToCheckout}>Revisar e continuar no site</button>
          <div className={publicUi.hint}>Ao enviar pelo WhatsApp, nada é cobrado automaticamente. Entre ou crie uma conta pra ver esse pedido depois em "Meus pedidos".</div>
        </div>
      </aside>
    </>
  );
}
