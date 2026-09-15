'use client';
import { publicUi } from '@/lib/ui';

import Link from '@/components/TenantLink';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { formatBRL } from '@/lib/format';
import { useCart } from '@/components/CartProvider';
import { useTalao } from '@/components/TalaoProvider';
import { useTalaoClientGate } from '@/components/useTalaoClientGate';
import { useClientSelfCheckoutGate } from '@/components/useClientSelfCheckoutGate';
import { useAuthUser } from '@/components/AuthProvider';
import CheckoutSteps from '@/components/CheckoutSteps';
import { useTenant } from '@/components/TenantProvider';
import { finalizeOrderSession } from '@/lib/ordersClient';
import { applyStockChangeClamp, buildStockChangeSummary, parseStockChangeDetails } from '@/lib/stockChangeError';

const PAYMENT_METHODS = [
  { id: 'pix', label: 'Pix' },
  { id: 'cartao', label: 'Cartão de crédito' },
];

export default function PagamentoPage() {
  const router = useRouter();
  const { href } = useTenant();
  const { cart, cartSubtotal, cartDiscountLabel, cartDiscountTotal, cartTotal, freight, saveOrderToHistory, changeQty, removeFromCart } = useCart();
  const talao = useTalao();
  const activeSession = talao?.activeSession ?? null;
  const gate = useTalaoClientGate();
  const { authUser } = useAuthUser();
  const selfCheckoutBlocked = useClientSelfCheckoutGate();
  const [isConfirming, setConfirming] = useState(false);
  // Preferência de pagamento gravada no pedido -- não cobra nada aqui (a
  // cobrança real só acontece depois que a loja separa o pedido, no link de
  // /pagar/[token], mesma regra já usada pelo Stripe hoje). Sem sessão de
  // talão ativa: obrigatório escolher antes de confirmar.
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);

  if (cart.length === 0) {
    return (
      <main className={`${publicUi.container} py-5 pb-14`}>
        <CheckoutSteps current="/pagamento" reachable={1} />
        <h1 className="mb-5 text-2xl font-extrabold tracking-[-0.03em]">Pagamento</h1>
        <div className={publicUi.empty}>
          Seu carrinho está vazio. <Link href="/carrinho">Voltar ao carrinho</Link>
        </div>
      </main>
    );
  }

  if (!freight) {
    return (
      <main className={`${publicUi.container} py-5 pb-14`}>
        <CheckoutSteps current="/pagamento" reachable={2} />
        <h1 className="mb-5 text-2xl font-extrabold tracking-[-0.03em]">Pagamento</h1>
        <div className={publicUi.empty}>
          Escolha a entrega primeiro. <Link href="/frete">Voltar para a entrega</Link>
        </div>
      </main>
    );
  }

  if (gate.blocked) {
    return (
      <main className={`${publicUi.container} py-5 pb-14`}>
        <CheckoutSteps current="/pagamento" reachable={2} />
        <h1 className="mb-5 text-2xl font-extrabold tracking-[-0.03em]">Pagamento</h1>
        <div className="max-w-[420px]">
          <p className="mb-4 text-sm text-brand-muted">
            {gate.reason === 'no-client'
              ? 'Vincule um cadastro de cliente (nome, CPF/CNPJ e e-mail) no talão antes de continuar.'
              : gate.reason === 'no-login'
                ? 'A cliente ainda não tem login — crie um pra ela no talão antes de continuar.'
                : 'Complete o cadastro da cliente (CPF/CNPJ e e-mail) no talão antes de continuar.'}
          </p>
          <button className={publicUi.primaryButton} onClick={gate.openTalao}>Abrir talão</button>
        </div>
      </main>
    );
  }

  // O carrinho remoto só é criado para cliente autenticada. Portanto,
  // visitante pode navegar pelo catálogo, mas precisa entrar antes de
  // chegar a qualquer etapa de checkout.
  if (!authUser) {
    return (
      <main className={`${publicUi.container} py-5 pb-14`}>
        <CheckoutSteps current="/pagamento" reachable={2} />
        <h1 className="mb-5 text-2xl font-extrabold tracking-[-0.03em]">Pagamento</h1>
        <div className="max-w-[420px]">
          <p className="mb-4 text-sm text-brand-muted">Pra finalizar o pedido você precisa entrar ou criar uma conta — seu carrinho continua salvo.</p>
          <div className={publicUi.checkoutActions}>
            <Link href={`/login?redirect=${encodeURIComponent('/pagamento')}`} className={publicUi.primaryButton}>Entrar</Link>
            <Link href={`/cadastro?redirect=${encodeURIComponent('/pagamento')}`} className={publicUi.subtleButton}>Criar conta</Link>
          </div>
        </div>
      </main>
    );
  }

  // Ferramenta "cliente finaliza sozinha" desligada (/ferramentas) — a
  // cliente está com uma vendedora atendendo (sessão de talão
  // compartilhada, ver ClientSessionProvider.tsx) e a loja exige que só a
  // vendedora feche o pedido.
  if (selfCheckoutBlocked) {
    return (
      <main className={`${publicUi.container} py-5 pb-14`}>
        <CheckoutSteps current="/pagamento" reachable={2} />
        <h1 className="mb-5 text-2xl font-extrabold tracking-[-0.03em]">Pagamento</h1>
        <p className="max-w-[420px] text-sm text-brand-muted">
          Esta loja finaliza pedidos de talão só pela vendedora — peça pra ela finalizar o pedido.
        </p>
      </main>
    );
  }

  const total = cartTotal + freight.price;

  // Pedido de talão: a vendedora monta carrinho + frete e finaliza aqui
  // mesmo, sem link de pagamento (mesma finalização usada em
  // OrderTalaoModal.tsx no workspace) — fecha o carrinho pra separação, o
  // pedido fica "novo". Sem sessão de talão, é a cliente comprando sozinha
  // e o pedido vai pro histórico dela.
  async function confirmOrder() {
    if (isConfirming) return;
    if (!activeSession && !paymentMethod) {
      toast.error('Escolha uma forma de pagamento antes de confirmar.');
      return;
    }
    setConfirming(true);
    try {
      if (activeSession) {
        await finalizeOrderSession(activeSession.id);
      } else {
        await saveOrderToHistory(cart, total, {
          channel: 'site',
          discount: cartDiscountTotal > 0 ? { label: cartDiscountLabel!, amount: cartDiscountTotal } : undefined,
          paymentMethod: paymentMethod!,
        });
      }
      router.push(href('/pedido-confirmado'));
    } catch (cause) {
      const details = parseStockChangeDetails(cause);
      if (details) {
        applyStockChangeClamp(cart, details, changeQty, removeFromCart);
        toast.error(`O estoque de algumas peças mudou — ajustamos seu carrinho: ${buildStockChangeSummary(details)}`);
        router.push(href('/carrinho'));
      } else {
        toast.error(cause instanceof Error ? cause.message : 'Não foi possível confirmar o pedido. Seu carrinho foi preservado.');
      }
      setConfirming(false);
    }
  }

  return (
    <main className={`${publicUi.container} py-5 pb-14`}>
      <CheckoutSteps current="/pagamento" reachable={3} />
      <h1 className="mb-5 text-2xl font-extrabold tracking-[-0.03em]">Pagamento</h1>

      <div className={publicUi.paymentOptions}>
        {PAYMENT_METHODS.map((method) => (
          <label key={method.id} className={publicUi.paymentOption}>
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

      <div className={publicUi.checkoutSummary}>
        <div className={publicUi.summaryLine}>
          <span>Subtotal</span>
          <span>{formatBRL(cartSubtotal)}</span>
        </div>
        {cartDiscountTotal > 0 && (
          <div className={`${publicUi.summaryLine} text-[#2e8b57]`}>
            <span>Desconto ({cartDiscountLabel})</span>
            <span>-{formatBRL(cartDiscountTotal)}</span>
          </div>
        )}
        <div className={publicUi.summaryLine}>
          <span>Entrega ({freight.label})</span>
          <span>{freight.price === 0 ? 'Grátis' : formatBRL(freight.price)}</span>
        </div>
        <div className={`${publicUi.summaryLine} border-t border-border/60 pt-1.5 text-sm font-bold text-brand-text`}>
          <span>Total</span>
          <span>{formatBRL(total)}</span>
        </div>
      </div>

      <div className={publicUi.checkoutActions}>
        <button
          className={publicUi.primaryButton}
          onClick={() => void confirmOrder()}
          disabled={isConfirming || (!activeSession && !paymentMethod)}
        >
          {isConfirming ? 'Finalizando…' : activeSession ? 'Finalizar pedido' : 'Confirmar pedido'}
        </button>
        <div className={publicUi.hint}>
          {activeSession
            ? 'Cobrança pelo app em breve — combine o pagamento direto com a cliente.'
            : 'Assim que a loja confirmar a separação do seu pedido, você recebe um link para pagar.'}
        </div>
      </div>

      <Link href="/frete" className={publicUi.backLink}><ArrowLeft className="size-4" aria-hidden="true" />Voltar para a entrega</Link>
    </main>
  );
}
