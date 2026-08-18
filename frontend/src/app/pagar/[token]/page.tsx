'use client';

import { use, useEffect, useState } from 'react';
import { formatBRL } from '@/lib/format';
import { CONFIG } from '@/lib/config';
import type { CartItem } from '@/domain/orders/types';

const PAYMENT_METHODS = [
  { id: 'pix', label: 'Pix' },
  { id: 'cartao', label: 'Cartão de crédito' },
  { id: 'boleto', label: 'Boleto' },
];

interface PaySummary {
  clientName: string;
  items: CartItem[];
  cartSubtotal: number;
  cartDiscountLabel: string | null;
  cartDiscountTotal: number;
  cartTotal: number;
  shipping?: { id: string; label: string; price: number; prazo: string };
  total: number;
}

// Página pública de pagamento — link gerado pela vendedora no talão (ver
// /frete, requestPaymentLink). Sem AppShell (ConditionalShell.tsx) e sem
// exigir login: o token da URL já é a autenticação (ver GET/POST
// /api/pay/[token]/route.ts).
export default function PagarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [summary, setSummary] = useState<PaySummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/pay/${token}`)
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data.message || data.error || 'Link inválido ou pedido já concluído.');
        }
        return r.json();
      })
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível abrir este link.'))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleConfirm() {
    if (!paymentMethod) return;
    setConfirming(true);
    setError('');
    try {
      const res = await fetch(`/api/pay/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentMethod: PAYMENT_METHODS.find((m) => m.id === paymentMethod)?.label }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Não foi possível confirmar o pagamento.');
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível confirmar o pagamento.');
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-form paylink-card">
        <h1>{CONFIG.storeName}</h1>

        {loading && <p>Carregando…</p>}

        {!loading && error && !done && <p className="login-error">{error}</p>}

        {!loading && done && (
          <p className="paylink-success">Pagamento confirmado! Obrigado pela compra.</p>
        )}

        {!loading && summary && !done && (
          <>
            <p className="paylink-hint">Pedido de {summary.clientName}</p>

            <div className="order-items">
              {summary.items.map((item) => (
                <div className="order-item" key={item.key}>
                  <img src={item.image || 'https://via.placeholder.com/80x100?text=Sem+imagem'} alt={item.name} />
                  <div>
                    <div className="name">{item.name}</div>
                    <div className="variant">
                      {[item.color, item.size].filter(Boolean).join(' · ')} — {item.qty}x {formatBRL(item.price)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="checkout-summary">
              <div className="order-summary-line">
                <span>Subtotal</span>
                <span>{formatBRL(summary.cartSubtotal)}</span>
              </div>
              {summary.cartDiscountTotal > 0 && (
                <div className="order-summary-line discount">
                  <span>Desconto ({summary.cartDiscountLabel})</span>
                  <span>-{formatBRL(summary.cartDiscountTotal)}</span>
                </div>
              )}
              {summary.shipping && (
                <div className="order-summary-line">
                  <span>Frete ({summary.shipping.label})</span>
                  <span>{summary.shipping.price === 0 ? 'Grátis' : formatBRL(summary.shipping.price)}</span>
                </div>
              )}
              <div className="order-summary-line total">
                <span>Total</span>
                <span>{formatBRL(summary.total)}</span>
              </div>
            </div>

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

            {error && <p className="login-error">{error}</p>}

            <button className="btn-add" disabled={!paymentMethod || confirming} onClick={handleConfirm}>
              {confirming ? 'Confirmando…' : 'Confirmar pagamento'}
            </button>
            <div className="whatsapp-hint">Simulação — nenhuma cobrança real é processada.</div>
          </>
        )}
      </div>
    </div>
  );
}
