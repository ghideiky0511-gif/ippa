'use client';
import { publicUi } from '@/lib/ui';

import Link from '@/components/TenantLink';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { formatBRL } from '@/lib/format';
import { useCart } from '@/components/CartProvider';
import { useTalao } from '@/components/TalaoProvider';
import { useTalaoClientGate } from '@/components/useTalaoClientGate';
import { useClientSelfCheckoutGate } from '@/components/useClientSelfCheckoutGate';
import { useAuthUser } from '@/components/AuthProvider';
import CheckoutSteps from '@/components/CheckoutSteps';
import { useTenant } from '@/components/TenantProvider';

const PAYMENT_METHODS = [
  { id: 'pix', label: 'Pix' },
  { id: 'cartao', label: 'Cartão de crédito' },
  { id: 'boleto', label: 'Boleto' },
];

export default function PagamentoPage() {
  const router = useRouter();
  const { href } = useTenant();
  const { cart, cartSubtotal, cartDiscountLabel, cartDiscountTotal, cartTotal, shipping, clearCart, clearShipping, saveOrderToHistory } = useCart();
  const talao = useTalao();
  const activeSession = talao?.activeSession ?? null;
  const gate = useTalaoClientGate();
  const { authUser } = useAuthUser();
  const selfCheckoutBlocked = useClientSelfCheckoutGate();

  if (cart.length === 0) {
    return (
      <main className="contents">
        <CheckoutSteps current="/pagamento" reachable={1} />
        <h1>Pagamento</h1>
        <div className={publicUi.empty}>
          Seu carrinho está vazio. <Link href="/carrinho">Voltar ao carrinho</Link>
        </div>
      </main>
    );
  }

  if (!shipping) {
    return (
      <main className="contents">
        <CheckoutSteps current="/pagamento" reachable={2} />
        <h1>Pagamento</h1>
        <div className={publicUi.empty}>
          Escolha o frete primeiro. <Link href="/frete">Voltar para o frete</Link>
        </div>
      </main>
    );
  }

  // Pedido de talão: a vendedora monta carrinho + frete, mas quem finaliza
  // o pagamento é a cliente, através do link gerado em /frete (ver
  // requestPaymentLink em TalaoProvider.tsx) — fecha esse "atalho" de
  // digitar /pagamento direto na URL e confirmar por ela.
  if (activeSession) {
    return (
      <main className="contents">
        <CheckoutSteps current="/pagamento" reachable={2} />
        <h1>Pagamento</h1>
        <div className="contents">
          Pagamento agora é feito pela cliente através do link — volte pro frete pra gerar/copiar.
          <Link href="/frete" className={publicUi.primaryButton}>Voltar para o frete</Link>
        </div>
      </main>
    );
  }

  if (gate.blocked) {
    return (
      <main className="contents">
        <CheckoutSteps current="/pagamento" reachable={2} />
        <h1>Pagamento</h1>
        <div className="contents">
          {gate.reason === 'no-client'
            ? 'Vincule um cadastro de cliente (nome, CPF/CNPJ, e-mail, CEP) no talão antes de continuar.'
            : gate.reason === 'no-login'
              ? 'A cliente ainda não tem login — crie um pra ela no talão antes de continuar.'
              : 'Complete o cadastro da cliente (CPF/CNPJ, e-mail, CEP) no talão antes de continuar.'}
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
      <main className="contents">
        <CheckoutSteps current="/pagamento" reachable={2} />
        <h1>Pagamento</h1>
        <div className="contents">
          Pra finalizar o pedido você precisa entrar ou criar uma conta — seu carrinho continua salvo.
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
  // vendedora feche o pedido (link de pagamento ou fechamento manual).
  if (selfCheckoutBlocked) {
    return (
      <main className="contents">
        <CheckoutSteps current="/pagamento" reachable={2} />
        <h1>Pagamento</h1>
        <div className="contents">
          Esta loja finaliza pedidos de talão só pela vendedora — peça pra ela gerar o link de pagamento ou fechar o pedido.
        </div>
      </main>
    );
  }

  const total = cartTotal + shipping.price;

  function confirmOrder() {
    saveOrderToHistory(cart, total, {
      channel: 'site',
      shipping,
      discount: cartDiscountTotal > 0 ? { label: cartDiscountLabel!, amount: cartDiscountTotal } : undefined,
    });
    clearCart();
    clearShipping();
    router.push(href('/pedido-confirmado'));
  }

  return (
    <main className="contents">
      <CheckoutSteps current="/pagamento" reachable={3} />
      <h1>Pagamento</h1>

      <div className={publicUi.paymentOptions}>
        {PAYMENT_METHODS.map((method) => (
          <label key={method.id} className={`${publicUi.paymentOption} opacity-50`}>
            <input type="radio" name="payment" disabled />
            {method.label} <span className="text-xs">(em breve)</span>
          </label>
        ))}
      </div>

      <div className={publicUi.checkoutSummary}>
        <div className={publicUi.summaryLine}>
          <span>Subtotal</span>
          <span>{formatBRL(cartSubtotal)}</span>
        </div>
        {cartDiscountTotal > 0 && (
          <div className="contents">
            <span>Desconto ({cartDiscountLabel})</span>
            <span>-{formatBRL(cartDiscountTotal)}</span>
          </div>
        )}
        <div className={publicUi.summaryLine}>
          <span>Frete ({shipping.label})</span>
          <span>{shipping.price === 0 ? 'Grátis' : formatBRL(shipping.price)}</span>
        </div>
        <div className="contents">
          <span>Total</span>
          <span>{formatBRL(total)}</span>
        </div>
      </div>

      <div className={publicUi.checkoutActions}>
        <button className={publicUi.primaryButton} onClick={confirmOrder}>
          Confirmar pedido
        </button>
        <div className={publicUi.hint}>Pagamento pelo site em breve — a loja entra em contato para combinar o pagamento.</div>
      </div>

      <Link href="/frete" className={publicUi.backLink}><ArrowLeft className="size-4" aria-hidden="true" />Voltar para o frete</Link>
    </main>
  );
}
