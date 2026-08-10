'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatBRL } from '@/lib/format';
import { calculateShipping } from '@/lib/shipping';
import { useCart } from '@/components/CartProvider';
import { useTalao } from '@/components/TalaoProvider';
import { useAuthUser } from '@/components/AuthProvider';
import { useTalaoClientGate } from '@/components/useTalaoClientGate';
import CheckoutSteps from '@/components/CheckoutSteps';
import type { Client, ShippingOption } from '@/lib/types';

export default function FretePage() {
  const router = useRouter();
  const { cart, cartSubtotal, cartDiscountLabel, cartDiscountTotal, cartTotal, shipping, setShipping } = useCart();
  const talao = useTalao();
  const activeSession = talao?.activeSession ?? null;
  const { authUser } = useAuthUser();
  const gate = useTalaoClientGate();
  const [cep, setCep] = useState('');
  const [options, setOptions] = useState<ShippingOption[] | null>(null);
  const [savedCep, setSavedCep] = useState<string | null>(null);
  const [linkState, setLinkState] = useState<{ token: string; error: string | null; loading: boolean }>({
    token: activeSession?.paymentToken || '',
    error: null,
    loading: false,
  });

  // Cliente logada com CEP salvo no cadastro — atalho pra não digitar de
  // novo (ver GET /api/clients/[id], que agora também autoriza a própria
  // cliente a buscar o próprio cadastro).
  useEffect(() => {
    if (!authUser?.clientId) return;
    let cancelled = false;
    fetch(`/api/clients/${authUser.clientId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((client: Client | null) => {
        if (!cancelled && client?.cep) setSavedCep(client.cep);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authUser?.clientId]);

  useEffect(() => {
    setLinkState((prev) => ({ ...prev, token: activeSession?.paymentToken || '' }));
  }, [activeSession?.paymentToken]);

  function handleCalculate(e: FormEvent) {
    e.preventDefault();
    setOptions(calculateShipping(cep));
  }

  function useSavedCep() {
    if (!savedCep) return;
    setCep(savedCep);
    setOptions(calculateShipping(savedCep));
  }

  function handleContinue() {
    if (!shipping) return;
    router.push('/pagamento');
  }

  async function handleGenerateLink() {
    setLinkState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const token = await talao!.requestPaymentLink();
      setLinkState({ token, error: null, loading: false });
    } catch (err) {
      setLinkState((prev) => ({ ...prev, loading: false, error: err instanceof Error ? err.message : 'Erro ao gerar o link.' }));
    }
  }

  function copyLink(link: string) {
    navigator.clipboard?.writeText(link).catch(() => {});
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

  const paymentLink = linkState.token && typeof window !== 'undefined' ? `${window.location.origin}/pagar/${linkState.token}` : '';

  return (
    <main className="container checkout-page">
      <CheckoutSteps current="/frete" reachable={reachable} />
      <h1>Frete</h1>

      {savedCep && (
        <button type="button" className="btn-clear cep-shortcut" onClick={useSavedCep}>
          Usar meu CEP cadastrado ({savedCep})
        </button>
      )}

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

      {activeSession ? (
        <div className="checkout-actions">
          {!paymentLink ? (
            <button className="btn-add" disabled={!shipping || linkState.loading} onClick={handleGenerateLink}>
              {linkState.loading ? 'Gerando link…' : 'Gerar link de pagamento'}
            </button>
          ) : (
            <div className="payment-link-panel">
              <p>Link de pagamento gerado — envie pra cliente:</p>
              <div className="payment-link-row">
                <input readOnly value={paymentLink} onFocus={(e) => e.target.select()} />
                <button type="button" className="btn-add" onClick={() => copyLink(paymentLink)}>Copiar</button>
              </div>
              <p className="payment-link-hint">Aguardando a cliente pagar — o pedido fecha sozinho assim que ela confirmar.</p>
            </div>
          )}
          {linkState.error && <p className="login-error">{linkState.error}</p>}
        </div>
      ) : (
        <div className="checkout-actions">
          <button className="btn-add" disabled={!shipping} onClick={handleContinue}>
            Continuar para pagamento
          </button>
        </div>
      )}

      <Link href="/carrinho" className="back-link">← Voltar ao carrinho</Link>
    </main>
  );
}
