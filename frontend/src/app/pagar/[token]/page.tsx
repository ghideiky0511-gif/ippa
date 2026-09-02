'use client';
import { publicUi } from '@/lib/ui';

import { use, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { loadStripe, type Stripe as StripeJsInstance } from '@stripe/stripe-js';
import { CardElement, Elements, useElements, useStripe } from '@stripe/react-stripe-js';
import { CardPayment, initMercadoPago } from '@mercadopago/sdk-react';
import { Lock, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { formatBRL } from '@/lib/format';
import { useTenant } from '@/components/TenantProvider';
import ProductImage from '@/components/ProductImage';
import TenantLink from '@/components/TenantLink';
import { methodIcon } from '@/components/payments/paymentMethodMeta';
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
// pedido (ver orderPaymentLinkService.ts) -- aqui sim roda uma cobrança real.
// `provider`/`publicCredentials` são genéricos por gateway (ver
// backend/src/services/orders/orderPaymentLinkService.ts::OrderPaymentSummary):
// stripe -> { publishableKey, stripeAccountId }; mercadopago -> { publicKey, userId }.
// null = nenhum gateway ativo/pronto pra cobrar.
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
  provider: string | null;
  publicCredentials: Record<string, unknown>;
}

type PaySummary = CheckoutSummary | ChargeSummary;

function stripeCredentials(summary: ChargeSummary): { publishableKey: string; stripeAccountId: string } | null {
  if (summary.provider !== 'stripe') return null;
  const creds = summary.publicCredentials as { publishableKey?: string | null; stripeAccountId?: string | null };
  if (!creds.publishableKey || !creds.stripeAccountId) return null;
  return { publishableKey: creds.publishableKey, stripeAccountId: creds.stripeAccountId };
}

function mercadoPagoCredentials(summary: ChargeSummary): { publicKey: string } | null {
  if (summary.provider !== 'mercadopago') return null;
  const creds = summary.publicCredentials as { publicKey?: string | null };
  if (!creds.publicKey) return null;
  return { publicKey: creds.publicKey };
}

function SummaryCard({ summary }: { summary: PaySummary }) {
  const discountLabel = summary.kind === 'checkout' ? summary.cartDiscountLabel : summary.discount?.label ?? null;
  const discountTotal = summary.kind === 'checkout' ? summary.cartDiscountTotal : summary.discount?.amount ?? 0;
  return (
    <div className={publicUi.card}>
      <div className="flex flex-col gap-2.5 p-4 sm:p-5">
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

        <div className="flex flex-col gap-1.5 border-t border-[#f0f0f0] pt-3">
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
          <div className="flex justify-between pt-1 text-base font-bold text-brand-text">
            <span>Total</span>
            <span>{formatBRL(summary.total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Coleta o cartão via Stripe Elements (a ippa nunca vê o número do cartão)
// e manda só o PaymentMethod id resultante pro backend -- que cobra a
// connected account correta (ver createOrderCharge). Precisa estar dentro
// de <Elements> pra usar useStripe/useElements.
function StripeChargeForm({ token, summary, onPaid }: { token: string; summary: ChargeSummary; onPaid: () => void }) {
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
        body: JSON.stringify({ method: 'cartao', cardToken: paymentMethod.id }),
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

function formatCountdown(expiresAt: string, now: number): string {
  const remainingMs = new Date(expiresAt).getTime() - now;
  if (remainingMs <= 0) return 'Expirado';
  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// Cobrança real via Mercado Pago (Split Payments) -- cliente escolhe Pix ou
// cartão aqui dentro (diferente da Stripe, que só oferece cartão hoje).
// Cartão usa o Card Payment Brick (tokeniza client-side, a ippa nunca vê o
// PAN, mesma garantia do fluxo Stripe); Pix não precisa de Brick pra criar
// a cobrança -- só GET/POST direto em /api/pay/[token] -- mas precisa de
// polling até a confirmação (o Mercado Pago não empurra status pro
// navegador, só por webhook pro backend).
function MercadoPagoChargeForm({ token, summary, onPaid }: { token: string; summary: ChargeSummary; onPaid: () => void }) {
  const [method, setMethod] = useState<'pix' | 'cartao'>('cartao');
  const [error, setError] = useState('');
  const [submittingPix, setSubmittingPix] = useState(false);
  const [pix, setPix] = useState<{ qrCode: string; copyPaste: string; expiresAt: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Só roda enquanto method === 'pix': senão o `now` ticando a cada
  // segundo com o Card Payment Brick já montado (method === 'cartao')
  // recria as callbacks inline abaixo (onSubmit/onError) a cada render,
  // e o efeito interno do Brick reinicia (desmonta+remonta) o brick a
  // cada tick -- na prática o formulário de cartão nunca termina de
  // carregar ("bugando e não abria", visto em produção). Ver comentário
  // acima de MercadoPagoChargeForm.
  useEffect(() => {
    if (!pix || method !== 'pix') return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [pix, method]);

  // Sem webhook chegando no navegador -- só sabendo se já pagou perguntando
  // de novo pro backend, que já reflete tanto o webhook quanto a
  // reconciliação ativa (ver GET /api/pay/[token]).
  useEffect(() => {
    if (!pix || method !== 'pix') return;
    const expired = new Date(pix.expiresAt).getTime() <= now;
    if (expired) return;
    const poll = setInterval(() => {
      fetch(`/api/pay/${token}`)
        .then((r) => r.json())
        .then((data) => {
          if (data?.paymentStatus === 'paid') onPaid();
        })
        .catch(() => undefined);
    }, 4000);
    return () => clearInterval(poll);
  }, [pix, now, token, onPaid, method]);

  async function handlePixSubmit() {
    if (submittingPix) return;
    setSubmittingPix(true);
    setError('');
    try {
      const res = await fetch(`/api/pay/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'pix' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Não foi possível gerar a cobrança Pix.');
      const result = data.result as { qrCode?: string; copyPaste?: string; expiresAt?: string } | undefined;
      if (!result?.qrCode || !result.copyPaste || !result.expiresAt) {
        throw new Error('Não foi possível gerar a cobrança Pix.');
      }
      setPix({ qrCode: result.qrCode, copyPaste: result.copyPaste, expiresAt: result.expiresAt });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível gerar a cobrança Pix.');
    } finally {
      setSubmittingPix(false);
    }
  }

  async function copyPixCode() {
    if (!pix) return;
    try {
      await navigator.clipboard.writeText(pix.copyPaste);
      toast.success('Código Pix copiado.');
    } catch {
      toast.error('Não foi possível copiar o código — selecione e copie manualmente.');
    }
  }

  // useCallback (identidade estável entre renders) -- passada direto pro
  // Brick como onSubmit/onError, cujo useEffect interno depende dessas
  // funções (ver node_modules/@mercadopago/sdk-react cardPayment/index.js):
  // uma nova identidade a cada render desmonta e reinicializa o brick
  // inteiro. Combinado com o guard de `method` nos efeitos do Pix acima,
  // fecha os dois jeitos desse remonte indesejado acontecer.
  const handleCardSubmit = useCallback(
    async (formData: { token: string; issuer_id: string; payment_method_id: string; installments: number }): Promise<void> => {
      const res = await fetch(`/api/pay/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'cartao',
          cardToken: formData.token,
          issuerId: formData.issuer_id,
          paymentMethodId: formData.payment_method_id,
          installments: formData.installments,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Não foi possível processar o pagamento.');
      if (data.result?.status === 'failed') {
        setError(data.result.failureReason || 'Cartão recusado — tente outro cartão.');
        return;
      }
      onPaid();
    },
    [token, onPaid],
  );

  const handleCardError = useCallback((brickError: { message?: string } | undefined) => {
    setError(brickError?.message || 'Não foi possível processar o cartão.');
  }, []);

  // Cartões clicáveis (ícone + rótulo) em vez de radio cru -- mesmos ícones
  // já usados no resumo do pedido (methodIcon, paymentMethodMeta.ts), pra o
  // cliente reconhecer o mesmo símbolo de Pix/cartão em toda a jornada.
  const methodPicker = (
    <div className={publicUi.payMethodGrid} role="radiogroup" aria-label="Forma de pagamento">
      {(['pix', 'cartao'] as const).map((id) => {
        const Icon = methodIcon(id);
        const active = method === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            className={`${publicUi.payMethodCard} ${active ? publicUi.payMethodCardActive : ''}`}
            onClick={() => {
              setMethod(id);
              setError('');
            }}
          >
            <Icon />
            {id === 'pix' ? 'Pix' : 'Cartão de crédito'}
          </button>
        );
      })}
    </div>
  );

  if (method === 'pix') {
    const expired = pix ? new Date(pix.expiresAt).getTime() <= now : false;
    return (
      <div className="contents">
        {methodPicker}
        {!pix || expired ? (
          <button className={publicUi.primaryButton} onClick={() => void handlePixSubmit()} disabled={submittingPix}>
            {submittingPix ? 'Gerando…' : expired ? 'Gerar novo código Pix' : `Gerar Pix ${formatBRL(summary.total)}`}
          </button>
        ) : (
          <div className={publicUi.field}>
            {/* eslint-disable-next-line @next/next/no-img-element -- data URI, não passa pelo otimizador de imagem */}
            <img src={pix.qrCode} alt="QR code Pix" className="mx-auto w-48 rounded-md border border-neutral-200 p-2" />
            <p className="mt-3 break-all rounded-md border border-neutral-300 bg-white p-2 text-xs">{pix.copyPaste}</p>
            <button type="button" className={publicUi.subtleButton} onClick={() => void copyPixCode()}>
              Copiar código
            </button>
            <p className={publicUi.hint}>
              Expira em {formatCountdown(pix.expiresAt, now)} — aguardando confirmação do pagamento…
            </p>
          </div>
        )}
        {error && <p className={publicUi.error}>{error}</p>}
      </div>
    );
  }

  return (
    <div className="contents">
      {methodPicker}
      <CardPayment
        initialization={{ amount: summary.total }}
        customization={{
          // 'flat' tira a maior parte do chrome visual próprio do Brick
          // (fontes/rótulos internos continuam fixos pelo Mercado Pago) pra
          // aproximar do resto do formulário, mesmo espírito do CardElement
          // da Stripe embrulhado à mão acima.
          visual: { style: { theme: 'flat' } },
        }}
        locale="pt-BR"
        onSubmit={handleCardSubmit}
        onError={handleCardError}
      />
      {error && <p className={publicUi.error}>{error}</p>}
    </div>
  );
}

// Página pública de pagamento -- alcançada tanto pelo link de finalização de
// checkout mais antigo (talão) quanto pelo link de cobrança real gerado
// depois que a loja separa o pedido (ver /pedidos/[orderNumber], "Pagar
// agora"). Sem AppShell (ConditionalShell.tsx) e sem exigir login: o token
// da URL já é a autenticação (ver GET/POST /api/pay/[token]/route.ts).
//
// Layout de duas colunas a partir de lg (payGrid, ver ui.ts): resumo do
// pedido fixo na coluna direita, form de pagamento na esquerda -- antes era
// só a mesma caixa de 450px do login esticada, sem nenhum tratamento pra
// tela larga. Estados de carregando/erro/concluído continuam numa coluna
// única centralizada (não fazem parte do "checkout" em si).
export default function PagarPage({ params }: { params: Promise<{ token: string }> }) {
  const { tenant } = useTenant();
  const { token } = use(params);
  const [summary, setSummary] = useState<PaySummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  const stripePromise = useMemo<Promise<StripeJsInstance | null> | null>(() => {
    if (summary?.kind !== 'charge') return null;
    const creds = stripeCredentials(summary);
    if (!creds) return null;
    // stripeAccount aqui é o que faz o PaymentMethod nascer já na connected
    // account do tenant -- sem isso a Stripe recusa a cobrança com
    // "resource_missing" (o PaymentMethod existiria só na conta da
    // plataforma, e createOrderCharge cobra via direct charge).
    return loadStripe(creds.publishableKey, { stripeAccount: creds.stripeAccountId });
  }, [summary]);

  const mercadoPagoCreds = summary?.kind === 'charge' ? mercadoPagoCredentials(summary) : null;
  const mercadoPagoPublicKey = mercadoPagoCreds?.publicKey ?? null;
  useEffect(() => {
    // Depende só da string (não do objeto `mercadoPagoCreds`, recriado a
    // cada render por mercadoPagoCredentials()) -- senão initMercadoPago
    // rodaria de novo em todo render em vez de só quando a chave muda.
    if (mercadoPagoPublicKey) initMercadoPago(mercadoPagoPublicKey, { locale: 'pt-BR' });
  }, [mercadoPagoPublicKey]);

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
  const isChargeCheckout = summary?.kind === 'charge';

  return (
    <div className={publicUi.payPage}>
      <div className={publicUi.payContainer}>
        <header className={publicUi.payHeader}>
          <div>
            <h1 className={publicUi.payHeaderTitle}>{tenant.name}</h1>
            {isChargeCheckout && <p className={publicUi.payHeaderMeta}>Pedido #{summary.orderNumber}</p>}
          </div>
          <span className={publicUi.payTrustBadge}>
            <Lock strokeWidth={2.5} />
            Ambiente seguro
          </span>
        </header>

        {loading && <p className={publicUi.muted}>Carregando…</p>}

        {!loading && error && !done && <p className={publicUi.error}>{error}</p>}

        {!loading && (done || alreadyPaid) && (
          <div className={publicUi.payFormCard}>
            <p className="contents">
              {summary?.kind === 'charge' ? 'Pagamento confirmado! Obrigado.' : 'Pedido confirmado! A loja vai entrar em contato para combinar o pagamento.'}
            </p>
            {summary?.kind === 'charge' && (
              <TenantLink href={`/pedidos/${summary.orderNumber}`} className={publicUi.primaryButton}>
                Ver pedido
              </TenantLink>
            )}
          </div>
        )}

        {!loading && summary && !done && !alreadyPaid && (
          <div className={publicUi.payGrid}>
            <div className={publicUi.paySummaryCol}>
              <SummaryCard summary={summary} />
            </div>

            <div className={publicUi.payFormCol}>
              <div className={publicUi.payFormCard}>
                <p className="text-sm text-brand-muted">Pedido de {summary.clientName}</p>

                {summary.kind === 'charge' ? (
                  summary.provider === 'stripe' ? (
                    stripePromise && stripeCredentials(summary) ? (
                      <Elements stripe={stripePromise}>
                        <StripeChargeForm token={token} summary={summary} onPaid={() => setDone(true)} />
                      </Elements>
                    ) : (
                      <p className={publicUi.error}>Pagamento por cartão indisponível no momento. Fale com a loja.</p>
                    )
                  ) : summary.provider === 'mercadopago' ? (
                    mercadoPagoCredentials(summary) ? (
                      <MercadoPagoChargeForm token={token} summary={summary} onPaid={() => setDone(true)} />
                    ) : (
                      <p className={publicUi.error}>Pagamento indisponível no momento. Fale com a loja.</p>
                    )
                  ) : (
                    <p className={publicUi.error}>Pagamento indisponível no momento. Fale com a loja.</p>
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

                {isChargeCheckout && (
                  <p className={publicUi.paySecureFooter}>
                    <ShieldCheck strokeWidth={2.5} />
                    Seus dados de pagamento são criptografados e nunca ficam com {tenant.name}.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
