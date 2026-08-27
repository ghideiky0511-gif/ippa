'use client';
import { publicUi } from '@/lib/ui';

import { FormEvent, useEffect, useState } from 'react';
import Link from '@/components/TenantLink';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check } from 'lucide-react';
import { formatBRL } from '@/lib/format';
import { fetchFreightProviders, fetchFreightQuotes } from '@/lib/shipping';
import { useCart } from '@/components/CartProvider';
import { useTalao } from '@/components/TalaoProvider';
import { useAuthUser } from '@/components/AuthProvider';
import { useTalaoClientGate } from '@/components/useTalaoClientGate';
import CheckoutSteps from '@/components/CheckoutSteps';
import type { Client } from '@/domain/clients/types';
import type { FreightQuote } from '@/domain/orders/types';
import { useTenant } from '@/components/TenantProvider';

export default function FretePage() {
  const router = useRouter();
  const { href } = useTenant();
  const { cart, cartSubtotal, cartDiscountLabel, cartDiscountTotal, cartTotal, freight, setFreight, freightSessionId } = useCart();
  const talao = useTalao();
  const activeSession = talao?.activeSession ?? null;
  const { authUser } = useAuthUser();
  const gate = useTalaoClientGate();
  const [cep, setCep] = useState('');
  const [options, setOptions] = useState<FreightQuote[] | null>(null);
  const [savedCep, setSavedCep] = useState<string | null>(null);

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

  async function loadOptions(value: string) {
    const quotes = freightSessionId
      ? await fetchFreightQuotes(freightSessionId, value || undefined)
      : await fetchFreightProviders();
    setOptions(quotes);
  }

  function handleCalculate(e: FormEvent) {
    e.preventDefault();
    void loadOptions(cep);
  }

  function useSavedCep() {
    if (!savedCep) return;
    setCep(savedCep);
    void loadOptions(savedCep);
  }

  function handleContinue() {
    if (!freight) return;
    router.push(href('/pagamento'));
  }

  const reachable = freight ? 3 : cart.length > 0 ? 2 : 1;

  if (cart.length === 0) {
    return (
      <main className={`${publicUi.container} py-5 pb-14`}>
        <CheckoutSteps current="/frete" reachable={1} />
        <h1 className="mb-5 text-2xl font-extrabold tracking-[-0.03em]">Frete</h1>
        <div className={publicUi.empty}>
          Seu carrinho está vazio. <Link href="/carrinho">Voltar ao carrinho</Link>
        </div>
      </main>
    );
  }

  // O checkout exige uma cliente autenticada porque o carrinho pertence à
  // sessão online dela.
  if (!authUser) {
    return (
      <main className={`${publicUi.container} py-5 pb-14`}>
        <CheckoutSteps current="/frete" reachable={1} />
        <h1 className="mb-5 text-2xl font-extrabold tracking-[-0.03em]">Frete</h1>
        <div className="max-w-[420px]">
          <p className="mb-4 text-sm text-brand-muted">Pra continuar pro frete você precisa entrar ou criar uma conta — seu carrinho continua salvo.</p>
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
      <main className={`${publicUi.container} py-5 pb-14`}>
        <CheckoutSteps current="/frete" reachable={2} />
        <h1 className="mb-5 text-2xl font-extrabold tracking-[-0.03em]">Frete</h1>
        <div className="max-w-[420px]">
          <p className="mb-4 text-sm text-brand-muted">
            {gate.reason === 'no-client'
              ? 'Vincule um cadastro de cliente (nome, CPF/CNPJ, e-mail, CEP) no talão antes de continuar pro frete.'
              : gate.reason === 'no-login'
                ? 'A cliente ainda não tem login — crie um pra ela no talão antes de continuar pro frete.'
                : 'Complete o cadastro da cliente (CPF/CNPJ, e-mail, CEP) no talão antes de continuar pro frete.'}
          </p>
          <button className={publicUi.primaryButton} onClick={gate.openTalao}>Abrir talão</button>
        </div>
      </main>
    );
  }

  // O pedido foi finalizado em /pagamento (outra aba/dispositivo, sem a
  // vendedora fazer nada aqui) — o Socket.IO já atualizou
  // activeSession.status sozinho (ver TalaoProvider.tsx), só faltava esta
  // tela reagir em vez de continuar mostrando o formulário de frete como se
  // nada tivesse acontecido.
  if (activeSession?.status === 'fechado') {
    return (
      <main className={`${publicUi.container} py-5 pb-14`}>
        <CheckoutSteps current="/frete" reachable={3} />
        <h1 className="mb-5 text-2xl font-extrabold tracking-[-0.03em]">Frete</h1>
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
          <Check className="size-5 text-success" aria-hidden="true" />
          <p>Pagamento confirmado! O pedido de {activeSession.clientName} foi fechado.</p>
        </div>
        <Link href="/catalogo" className={publicUi.backLink}><ArrowLeft className="size-4" aria-hidden="true" />Voltar ao catálogo</Link>
      </main>
    );
  }

  return (
    <main className={`${publicUi.container} py-5 pb-14`}>
      <CheckoutSteps current="/frete" reachable={reachable} />
      <h1 className="mb-5 text-2xl font-extrabold tracking-[-0.03em]">Frete</h1>

      {savedCep && (
        <div className="mb-3">
          <button type="button" className={publicUi.linkButton} onClick={useSavedCep}>
            Usar meu CEP cadastrado ({savedCep})
          </button>
        </div>
      )}

      <form className={publicUi.fieldRow} onSubmit={handleCalculate}>
        <input
          type="text"
          placeholder="Digite seu CEP"
          value={cep}
          onChange={(e) => setCep(e.target.value)}
          className={publicUi.input}
        />
        <button type="submit" className={publicUi.primaryButton}>Calcular</button>
      </form>

      {options && (
        <div className="my-4 flex flex-col gap-2.5 max-w-[420px]">
          {options.map((opt) => {
            const selected = freightSessionId ? freight?.quoteId === opt.id : freight?.providerId === opt.providerId;
            return (
              <label key={opt.id} className={[publicUi.paymentOption, selected ? 'border-brand-primary' : ''].join(' ')}>
                <input
                  type="radio"
                  name="shipping"
                  checked={selected}
                  onChange={() => setFreight(opt)}
                />
                <div className="flex flex-1 flex-col gap-0.5">
                  <div>{opt.label}</div>
                  <div className="text-xs font-normal text-brand-muted">{opt.etaLabel}</div>
                </div>
                <div className="font-semibold">{opt.price === 0 ? 'Grátis' : formatBRL(opt.price)}</div>
              </label>
            );
          })}
        </div>
      )}

      {freight && (
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
            <span>Frete ({freight.label})</span>
            <span>{freight.price === 0 ? 'Grátis' : formatBRL(freight.price)}</span>
          </div>
          <div className={`${publicUi.summaryLine} border-t border-border/60 pt-1.5 text-sm font-bold text-brand-text`}>
            <span>Total</span>
            <span>{formatBRL(cartTotal + freight.price)}</span>
          </div>
        </div>
      )}

      <div className={publicUi.checkoutActions}>
        <button className={publicUi.primaryButton} disabled={!freight} onClick={handleContinue}>
          Continuar para pagamento
        </button>
      </div>

      <Link href="/carrinho" className={publicUi.backLink}><ArrowLeft className="size-4" aria-hidden="true" />Voltar ao carrinho</Link>
    </main>
  );
}
