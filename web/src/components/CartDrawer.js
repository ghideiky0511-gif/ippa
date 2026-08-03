'use client';

import { formatBRL } from '@/lib/format';
import { CONFIG } from '@/lib/config';
import { useCart } from './CartProvider';

export default function CartDrawer() {
  const { cart, cartTotal, isCartOpen, closeCart, changeQty, removeFromCart, clearCart, saveOrderToHistory } = useCart();

  function checkoutWhatsapp() {
    if (cart.length === 0) {
      alert('Seu carrinho está vazio.');
      return;
    }
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
            cart.map((item) => {
              const variantParts = [item.color, item.size].filter(Boolean);
              return (
                <div className="cart-item" key={item.key}>
                  <img src={item.image || 'https://via.placeholder.com/100x120?text=Sem+imagem'} alt={item.name} />
                  <div className="info">
                    <div className="name">{item.name}</div>
                    {variantParts.length > 0 && <div className="variant">{variantParts.join(' · ')}</div>}
                    <div className="qty-row">
                      <button onClick={() => changeQty(item.key, Math.max(1, item.qty - 1))}>-</button>
                      <span>{item.qty}</span>
                      <button onClick={() => changeQty(item.key, item.qty + 1)}>+</button>
                      <button className="remove" style={{ marginLeft: 10 }} onClick={() => removeFromCart(item.key)}>remover</button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="cart-footer">
          <div className="cart-total"><span>Total</span><span>{formatBRL(cartTotal)}</span></div>
          <button className="btn-whatsapp" onClick={checkoutWhatsapp}>Finalizar pedido via WhatsApp</button>
          <div className="whatsapp-hint">Ao enviar, o pedido fica salvo em "Meus pedidos" neste navegador. Nada é cobrado automaticamente.</div>
        </div>
      </aside>
    </>
  );
}
