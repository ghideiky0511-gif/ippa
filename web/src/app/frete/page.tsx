'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatBRL } from '@/lib/format';
import { calculateShipping } from '@/lib/shipping';
import { useCart } from '@/components/CartProvider';
import { useTalaoClientGate } from '@/components/useTalaoClientGate';
import CheckoutSteps from '@/components/CheckoutSteps';
import type { ShippingOption } from '@/lib/types';

export default function FretePage() {
  const router = useRouter();
  const { cart, cartSubtotal, cartDiscountLabel, cartDiscountTotal, cartTotal, shipping, setShipping } = useCart();
  const gate = useTalaoClientGate();
  const [cep, setCep] = useState('');
  const [options, setOptions] = useState<ShippingOption[] | null>(null);

  function handleCalculate(e: FormEvent) {
    e.preventDefault();
    setOptions(calculateShipping(cep));
  }

  function handleContinue() {
    if (!shipping) return;
    router.push('/pagamento');
  }

  const reachable = shipping ? 3 : cart.length > 0 ? 2 : 1;

  if (cart.length === 0) {
    return (
      <main className="container checkout-page">
        <CheckoutSteps current="/frete" reachable={1} />
        <h1>Frete</h1>
        <div className="cart-empty">
          Seu carrinho está vazio. <Link href="/carrinho">Voltar ao carrinho</Link>
        </div>
      </main>
    );
  }

  if (gate.blocked) {
    return (
      <main className="container checkout-page">
        <CheckoutSteps current="/frete" reachable={2} />
        <h1>Frete</h1>
        <div className="cart-empty talao-gate">
          {gate.reason === 'no-client'
            ? 'Vincule um cadastro de cliente (nome, CPF/CNPJ, e-mail, CEP) no talão antes de continuar pro frete.'
            : 'Complete o cadastro da cliente (CPF/CNPJ, e-mail, CEP) no talão antes de continuar pro frete.'}
          <button className="btn-add" onClick={gate.openTalao}>Abrir talão</button>
        </div>
      </main>
    );
  }

  return (
    <main className="container checkout-page">
      <CheckoutSteps current="/frete" reachable={reachable} />
      <h1>Frete</h1>

      <form className="cep-form" onSubmit={handleCalculate}>
        <input
          type="text"
          placeholder="Digite seu CEP"
          value={cep}
          onChange={(e) => setCep(e.target.value)}
        />
        <button type="submit" className="btn-add">Calcular</button>
      </form>

      {options && (
        <div className="shipping-options">
          {options.map((opt) => (
            <label key={opt.id} className={'shipping-option' + (shipping?.id === opt.id ? ' selected' : '')}>
              <input
                type="radio"
                name="shipping"
                checked={shipping?.id === opt.id}
                onChange={() => setShipping(opt)}
              />
              <div className="shipping-option-info">
                <div className="shipping-option-label">{opt.label}</div>
                <div className="shipping-option-prazo">{opt.prazo}</div>
              </div>
              <div className="shipping-option-price">{opt.price === 0 ? 'Grátis' : formatBRL(opt.price)}</div>
            </label>
          ))}
        </div>
      )}

      {shipping && (
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
          <div className="order-summary-line">
            <span>Frete ({shipping.label})</span>
            <span>{shipping.price === 0 ? 'Grátis' : formatBRL(shipping.price)}</span>
          </div>
          <div className="order-summary-line total">
            <span>Total</span>
            <span>{formatBRL(cartTotal + shipping.price)}</span>
          </div>
        </div>
      )}

      <div className="checkout-actions">
        <button className="btn-add" disabled={!shipping} onClick={handleContinue}>
          Continuar para pagamento
        </button>
      </div>

      <Link href="/carrinho" className="back-link">← Voltar ao carrinho</Link>
    </main>
  );
}
