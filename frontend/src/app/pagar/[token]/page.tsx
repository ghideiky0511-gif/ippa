'use client';
import { publicUi } from '@/lib/ui';

import { use, useEffect, useMemo, useState, type FormEvent } from 'react';
import { loadStripe, type Stripe as StripeJsInstance } from '@stripe/stripe-js';
import { CardElement, Elements, useElements, useStripe } from '@stripe/react-stripe-js';
import { formatBRL } from '@/lib/format';
import { useTenant } from '@/components/TenantProvider';
import ProductImage from '@/components/ProductImage';
import TenantLink from '@/components/TenantLink';
import type { CartItem } from '@/domain/orders/types';

const PAYMENT_METHODS = [
  { id: 'pix', label: 'Pix' },
  { id: 'cartao', label: 'Cartão de crédito' },
  { id: 'boleto', label: 'Boleto' },
];

interface OrderFreightSummary {
  label: string;
  price: number;
  etaLabel: string | null;
}

// Fluxo antigo: link gerado ANTES do checkout terminar (ver
// paymentService.ts::confirmPayment) -- só finaliza o pedido, nunca cobrou
// de verdade. Mantido como está, sem mudanças.
interface CheckoutSummary {
  kind: 'checkout';
  clientName: string;
  items: CartItem[];
  cartSubtotal: number;
  cartDiscountLabel: string | null;
  cartDiscountTotal: number;
  cartTotal: number;
  freight?: OrderFreightSummary;
  total: number;
}

// Fluxo novo: link gerado DEPOIS que a loja confirmou a separação física do
// pedido (ver orderPaymentLinkService.ts) -- aqui sim roda uma cobrança real
// via Stripe.
interface ChargeSummary {
  kind: 'charge';
  orderId: string;
  orderNumber: number;
  clientName: string;
  items: CartItem[];
  total: number;
  discount?: { label: string; amount: number };
  freight?: OrderFreightSummary;
  paymentStatus: 'unpaid' | 'awaiting_confirmation' | 'paid' | 'payment_failed';
  publishableKey: string | null;
  stripeAccountId: string | null;
}

type PaySummary = CheckoutSummary | ChargeSummary;

function SummaryCard({ summary }: { summary: PaySummary }) {
  const discountLabel = summary.kind === 'checkout' ? summary.cartDiscountLabel : summary.discount?.label ?? null;
  const discountTotal = summary.kind === 'checkout' ? summary.cartDiscountTotal : summary.discount?.amount ?? 0;
  return (
    <>
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
        {summary.kind === 'checkout' && (
          <div className={publicUi.summaryLine}>
            <span>Subtotal</span>
            <span>{formatBRL(summary.cartSubtotal)}</span>
          </div>
        )}
        {discountTotal > 0 && (
          <div className={publicUi.summaryLine}>
            <span>Desconto ({discountLabel})</span>
            <span>-{formatBRL(discountTotal)}</span>
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
    </>
  );
}

// Coleta o cartão via Stripe Elements (a ippa nunca vê o número do cartão)
// e manda só o PaymentMethod id resultante pro backend -- que cobra a
// connected account correta (ver createOrderCharge). Precisa estar dentro
// de <Elements> pra usar useStripe/useElements.
function ChargeForm({ token, summary, onPaid }: { token: string; summary: ChargeSummary; onPaid: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!stripe || !elements || submitting) return;
    const card = elements.getElement(CardElement);
    if (!card) return;
    setSubmitting(true);
    setError('');
    const { paymentMethod, error: pmError } = await stripe.createPaymentMethod({
      type: 'card',
      card,
      billing_details: summary.clientName ? { name: summary.clientName } : undefined,
    });
    if (pmError || !paymentMethod) {
      setError(pmError?.message || 'Não foi possível processar o cartão.');
      setSubmitting(false);
      return;
    }
    try {
      const res = await fetch(`/api/pay/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardToken: paymentMethod.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Não foi possível processar o pagamento.');
      if (data.result?.status === 'failed') {
        setError(data.result.failureReason || 'Cartão recusado — tente outro cartão.');
        setSubmitting(false);
        return;
      }
      onPaid();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível processar o pagamento.');
      setSubmitting(false);
    }
  }

  return (
    <form className="contents" onSubmit={(event) => void handleSubmit(event)}>
      <div className={publicUi.field}>
        <label>Dados do cartão</label>
        <div className="rounded-md border border-neutral-300 bg-white px-3 py-2.5">
          <CardElement options={{ hidePostalCode: true, style: { base: { fontSize: '15px' } } }} />
        </div>
      </div>
      {error && <p className={publicUi.error}>{error}</p>}
      <button className={publicUi.primaryButton} disabled={!stripe || submitting} type="submit">
        {submitting ? 'Processando…' : `Pagar ${formatBRL(summary.total)}`}
      </button>
    </form>
  );
}

// Página pública de pagamento -- alcançada tanto pelo link de finalização de
// checkout mais antigo (talão) quanto pelo link de cobrança real gerado
// depois que a loja separa o pedido (ver /pedidos/[orderNumber], "Pagar
// agora"). Sem AppShell (ConditionalShell.tsx) e sem exigir login: o token
// da URL já é a autenticação (ver GET/POST /api/pay/[token]/route.ts).
export default function PagarPage({ params }: { params: Promise<{ token: string }> }) {
  const { tenant } = useTenant();
  const { token } = use(params);
  const [summary, setSummary] = useState<PaySummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  const stripePromise = useMemo<Promise<StripeJsInstance | null> | null>(() => {
    if (summary?.kind !== 'charge' || !summary.publishableKey || !summary.stripeAccountId) return null;
    // stripeAccount aqui é o que faz o PaymentMethod nascer já na connected
    // account do tenant -- sem isso a Stripe recusa a cobrança com
    // "resource_missing" (o PaymentMethod existiria só na conta da
    // plataforma, e createOrderCharge cobra via direct charge).
    return loadStripe(summary.publishableKey, { stripeAccount: summary.stripeAccountId });
  }, [summary]);

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

  const alreadyPaid = summary?.kind === 'charge' && summary.paymentStatus === 'paid';

  return (
    <div className={publicUi.loginPage}>
      <section className={publicUi.loginForm}>
        <h1>{tenant.name}</h1>

        {loading && <p>Carregando…</p>}

        {!loading && error && !done && <p className={publicUi.error}>{error}</p>}

        {!loading && (done || alreadyPaid) && (
          <>
            <p className="contents">
              {summary?.kind === 'charge' ? 'Pagamento confirmado! Obrigado.' : 'Pedido confirmado! A loja vai entrar em contato para combinar o pagamento.'}
            </p>
            {summary?.kind === 'charge' && (
              <TenantLink href={`/pedidos/${summary.orderNumber}`} className={publicUi.primaryButton}>
                Ver pedido
              </TenantLink>
            )}
          </>
        )}

        {!loading && summary && !done && !alreadyPaid && (
          <>
            <p className="contents">Pedido de {summary.clientName}</p>

            <SummaryCard summary={summary} />

            {summary.kind === 'charge' ? (
              summary.publishableKey && stripePromise ? (
                <Elements stripe={stripePromise}>
                  <ChargeForm token={token} summary={summary} onPaid={() => setDone(true)} />
                </Elements>
              ) : (
                <p className={publicUi.error}>Pagamento por cartão indisponível no momento. Fale com a loja.</p>
              )
            ) : (
              <>
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
          </>
        )}
      </section>
    </div>
  );
}
