'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatBRL } from '@/lib/format';
import { useCart } from '@/components/CartProvider';
import CheckoutSteps from '@/components/CheckoutSteps';

const PAYMENT_METHODS = [
  { id: 'pix', label: 'Pix' },
  { id: 'cartao', label: 'Cartão de crédito' },
  { id: 'boleto', label: 'Boleto' },
];

export default function PagamentoPage() {
  const router = useRouter();
  const { cart, cartTotal, shipping, clearCart, clearShipping, saveOrderToHistory } = useCart();
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);

  if (cart.length === 0) {
    return (
      <main className="container checkout-page">
        <CheckoutSteps current="/pagamento" reachable={1} />
        <h1>Pagamento</h1>
        <div className="cart-empty">
          Seu carrinho está vazio. <Link href="/carrinho">Voltar ao carrinho</Link>
        </div>
      </main>
    );
  }

  if (!shipping) {
    return (
      <main className="container checkout-page">
        <CheckoutSteps current="/pagamento" reachable={2} />
        <h1>Pagamento</h1>
        <div className="cart-empty">
          Escolha o frete primeiro. <Link href="/frete">Voltar para o frete</Link>
        </div>
      </main>
    );
  }

  const total = cartTotal + shipping.price;

  function confirmOrder() {
    if (!paymentMethod) return;
    saveOrderToHistory(cart, total, {
      channel: 'site',
      shipping,
      paymentMethod: PAYMENT_METHODS.find((m) => m.id === paymentMethod)?.label,
    });
    clearCart();
    clearShipping();
    router.push('/pedido-confirmado');
  }

  return (
    <main className="container checkout-page">
      <CheckoutSteps current="/pagamento" reachable={3} />
      <h1>Pagamento</h1>

      <div className="payment-methods">
        {PAYMENT_METHODS.map((method) => (
          <label key={method.id} className={'payment-method' + (paymentMethod === method.id ? ' selected' : '')}>
            <input
              type="radio"
              name="payment"
              checked={paymentMethod === method.id}
              onChange={() => setPaymentMethod(method.id)}
            />
            {method.label}
          </label>
        ))}
      </div>

      <div className="checkout-summary">
        <div className="order-summary-line">
          <span>Subtotal</span>
          <span>{formatBRL(cartTotal)}</span>
        </div>
        <div className="order-summary-line">
          <span>Frete ({shipping.label})</span>
          <span>{shipping.price === 0 ? 'Grátis' : formatBRL(shipping.price)}</span>
        </div>
        <div className="order-summary-line total">
          <span>Total</span>
          <span>{formatBRL(total)}</span>
        </div>
      </div>

      <div className="checkout-actions">
        <button className="btn-add" disabled={!paymentMethod} onClick={confirmOrder}>
          Confirmar pedido
        </button>
        <div className="whatsapp-hint">Simulação — nenhuma cobrança real é processada.</div>
      </div>

      <Link href="/frete" className="back-link">← Voltar para o frete</Link>
    </main>
  );
}
