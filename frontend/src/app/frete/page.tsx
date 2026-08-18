'use client';
import { publicUi } from '@/lib/ui';

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
import type { Client } from '@/domain/clients/types';
import type { ShippingOption } from '@/domain/orders/types';

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

  // CEP salvo no cadastro — atalho pra não digitar de novo (ver
  // GET /api/clients/[id]). Duas origens possíveis: a própria cliente
  // logada vendo o frete dela (authUser.clientId), OU a vendedora dentro do
  // talão de uma cliente com cadastro (activeSession.clientId) — a API já
  // autoriza vendedora a buscar qualquer cadastro, só faltava a tela pedir.
  useEffect(() => {
    const clientId = activeSession?.clientId || authUser?.clientId;
    if (!clientId) return;
    let cancelled = false;
    fetch(`/api/clients/${clientId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((client: Client | null) => {
        if (!cancelled && client?.cep) setSavedCep(client.cep);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeSession?.clientId, authUser?.clientId]);

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
      <main className="contents">
        <CheckoutSteps current="/frete" reachable={1} />
        <h1>Frete</h1>
        <div className={publicUi.empty}>
          Seu carrinho está vazio. <Link href="/carrinho">Voltar ao carrinho</Link>
        </div>
      </main>
    );
  }

  // Montar/revisar o carrinho não exige login — combinado com o usuário:
  // a partir daqui (seguir pro frete) sim, porque sem login não dá nem pra
  // ver preço (ver hidePriceWithoutLogin em /ferramentas). O carrinho
  // continua salvo (localStorage) enquanto ela entra/cria conta.
  if (!authUser) {
    return (
      <main className="contents">
        <CheckoutSteps current="/frete" reachable={1} />
        <h1>Frete</h1>
        <div className="contents">
          Pra continuar pro frete você precisa entrar ou criar uma conta — seu carrinho continua salvo.
          <div className={publicUi.checkoutActions}>
            <Link href={`/login?redirect=${encodeURIComponent('/frete')}`} className={publicUi.primaryButton}>Entrar</Link>
            <Link href={`/cadastro?redirect=${encodeURIComponent('/frete')}`} className={publicUi.subtleButton}>Criar conta</Link>
          </div>
        </div>
      </main>
    );
  }

  if (gate.blocked) {
    return (
      <main className="contents">
        <CheckoutSteps current="/frete" reachable={2} />
        <h1>Frete</h1>
        <div className="contents">
          {gate.reason === 'no-client'
            ? 'Vincule um cadastro de cliente (nome, CPF/CNPJ, e-mail, CEP) no talão antes de continuar pro frete.'
            : gate.reason === 'no-login'
              ? 'A cliente ainda não tem login — crie um pra ela no talão antes de continuar pro frete.'
              : 'Complete o cadastro da cliente (CPF/CNPJ, e-mail, CEP) no talão antes de continuar pro frete.'}
          <button className={publicUi.primaryButton} onClick={gate.openTalao}>Abrir talão</button>
        </div>
      </main>
    );
  }

  // A cliente pagou pelo link (outra aba/dispositivo, sem a vendedora fazer
  // nada aqui) — SSE já atualizou activeSession.status sozinho (ver
  // TalaoProvider.tsx), só faltava esta tela reagir em vez de continuar
  // mostrando "gerar link" como se nada tivesse acontecido (achado
  // reportado pelo usuário).
  if (activeSession?.status === 'fechado') {
    return (
      <main className="contents">
        <CheckoutSteps current="/frete" reachable={3} />
        <h1>Frete</h1>
        <div className="contents">
          <span className="contents" aria-hidden="true">✓</span>
          <p>Pagamento confirmado! O pedido de {activeSession.clientName} foi fechado.</p>
        </div>
        <Link href="/catalogo" className={publicUi.backLink}>← Voltar ao catálogo</Link>
      </main>
    );
  }

  const paymentLink = linkState.token && typeof window !== 'undefined' ? `${window.location.origin}/pagar/${linkState.token}` : '';

  return (
    <main className="contents">
      <CheckoutSteps current="/frete" reachable={reachable} />
      <h1>Frete</h1>

      {savedCep && (
        <button type="button" className="contents" onClick={useSavedCep}>
          Usar meu CEP cadastrado ({savedCep})
        </button>
      )}

      <form className="contents" onSubmit={handleCalculate}>
        <input
          type="text"
          placeholder="Digite seu CEP"
          value={cep}
          onChange={(e) => setCep(e.target.value)}
        />
        <button type="submit" className={publicUi.primaryButton}>Calcular</button>
      </form>

      {options && (
        <div className="contents">
          {options.map((opt) => (
            <label key={opt.id} className={[publicUi.paymentOption, shipping?.id === opt.id ? 'border-brand-primary' : ''].join(' ')}>
              <input
                type="radio"
                name="shipping"
                checked={shipping?.id === opt.id}
                onChange={() => setShipping(opt)}
              />
              <div className="contents">
                <div className="contents">{opt.label}</div>
                <div className="contents">{opt.prazo}</div>
              </div>
              <div className="contents">{opt.price === 0 ? 'Grátis' : formatBRL(opt.price)}</div>
            </label>
          ))}
        </div>
      )}

      {shipping && (
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
            <span>{formatBRL(cartTotal + shipping.price)}</span>
          </div>
        </div>
      )}

      {activeSession ? (
        <div className={publicUi.checkoutActions}>
          {!paymentLink ? (
            <button className={publicUi.primaryButton} disabled={!shipping || linkState.loading} onClick={handleGenerateLink}>
              {linkState.loading ? 'Gerando link…' : 'Gerar link de pagamento'}
            </button>
          ) : (
            <div className="contents">
              <p>Link de pagamento gerado — envie pra cliente:</p>
              <div className="contents">
                <input readOnly value={paymentLink} onFocus={(e) => e.target.select()} />
                <button type="button" className={publicUi.primaryButton} onClick={() => copyLink(paymentLink)}>Copiar</button>
              </div>
              <p className="contents">Aguardando a cliente pagar — o pedido fecha sozinho assim que ela confirmar.</p>
              <button type="button" className={publicUi.subtleButton} disabled={linkState.loading} onClick={handleGenerateLink}>
                {linkState.loading ? 'Gerando…' : 'Link expirou? Gerar novo'}
              </button>
            </div>
          )}
          {linkState.error && <p className={publicUi.error}>{linkState.error}</p>}
        </div>
      ) : (
        <div className={publicUi.checkoutActions}>
          <button className={publicUi.primaryButton} disabled={!shipping} onClick={handleContinue}>
            Continuar para pagamento
          </button>
        </div>
      )}

      <Link href="/carrinho" className={publicUi.backLink}>← Voltar ao carrinho</Link>
    </main>
  );
}
