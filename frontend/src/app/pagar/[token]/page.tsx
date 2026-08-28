'use client';
import { publicUi } from '@/lib/ui';

import { use, useEffect, useState } from 'react';
import { formatBRL } from '@/lib/format';
import { CONFIG } from '@/lib/config';
import { useTenant } from '@/components/TenantProvider';
import ProductImage from '@/components/ProductImage';
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
  freight?: { label: string; price: number; etaLabel: string | null };
  total: number;
}

// Página pública de pagamento — link gerado pela vendedora no talão (ver
// /frete, requestPaymentLink). Sem AppShell (ConditionalShell.tsx) e sem
// exigir login: o token da URL já é a autenticação (ver GET/POST
// /api/pay/[token]/route.ts).
export default function PagarPage({ params }: { params: Promise<{ token: string }> }) {
  const { tenant } = useTenant();
  const { token } = use(params);
  const [summary, setSummary] = useState<PaySummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
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
    setConfirming(true);
    setError('');
    try {
      const res = await fetch(`/api/pay/${token}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Não foi possível confirmar o pedido.');
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível confirmar o pedido.');
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className={publicUi.loginPage}>
      <section className={publicUi.loginForm}>
        <h1>{tenant.name}</h1>

        {loading && <p>Carregando…</p>}

        {!loading && error && !done && <p className={publicUi.error}>{error}</p>}

        {!loading && done && (
          <p className="contents">Pedido confirmado! A loja vai entrar em contato para combinar o pagamento.</p>
        )}

        {!loading && summary && !done && (
          <>
            <p className="contents">Pedido de {summary.clientName}</p>

            <div className={publicUi.orderItems}>
              {summary.items.map((item) => (
                <div className={publicUi.orderItem} key={item.key}>
                  <ProductImage src={item.image} alt={item.name} className={publicUi.orderItemImage} />
                  <div>
                    <div className="contents">{item.name}</div>
                    <div className="contents">
                      {[item.color, item.size].filter(Boolean).join(' · ')} — {item.qty}x {formatBRL(item.price)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className={publicUi.checkoutSummary}>
              <div className={publicUi.summaryLine}>
                <span>Subtotal</span>
                <span>{formatBRL(summary.cartSubtotal)}</span>
              </div>
              {summary.cartDiscountTotal > 0 && (
                <div className={publicUi.summaryLine}>
                  <span>Desconto ({summary.cartDiscountLabel})</span>
                  <span>-{formatBRL(summary.cartDiscountTotal)}</span>
                </div>
              )}
              {summary.freight && (
                <div className={publicUi.summaryLine}>
                  <span>Frete ({summary.freight.label})</span>
                  <span>{summary.freight.price === 0 ? 'Grátis' : formatBRL(summary.freight.price)}</span>
                </div>
              )}
              <div className={publicUi.summaryLine}>
                <span>Total</span>
                <span>{formatBRL(summary.total)}</span>
              </div>
            </div>

            <div className={publicUi.paymentOptions}>
              {PAYMENT_METHODS.map((method) => (
                <label key={method.id} className={`${publicUi.paymentOption} opacity-50`}>
                  <input type="radio" name="payment" disabled />
                  {method.label} <span className="text-xs">(em breve)</span>
                </label>
              ))}
            </div>

            {error && <p className={publicUi.error}>{error}</p>}

            <button className={publicUi.primaryButton} disabled={confirming} onClick={handleConfirm}>
              {confirming ? 'Confirmando…' : 'Confirmar pedido'}
            </button>
            <div className={publicUi.hint}>Pagamento pelo site em breve — a loja entra em contato para combinar o pagamento.</div>
          </>
        )}
      </section>
    </div>
  );
}
