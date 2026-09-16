'use client';
import { publicUi } from '@/lib/ui';

import { useEffect, useState } from 'react';
import Link from '@/components/TenantLink';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check } from 'lucide-react';
import { useCart } from '@/components/CartProvider';
import { useTalao } from '@/components/TalaoProvider';
import { useAuthUser } from '@/components/AuthProvider';
import { useTalaoClientGate } from '@/components/useTalaoClientGate';
import CheckoutSteps from '@/components/CheckoutSteps';
import CartReviewGroups from '@/components/CartReviewGroups';
import CartReviewInsightCard from './_components/CartReviewInsightCard';
import { useTenant } from '@/components/TenantProvider';
import { apiFetch } from '@/lib/api-client';
import { CartReviewSchema, type CartReview } from '@/contracts/ai';

export default function RevisaoPage() {
  const router = useRouter();
  const { href } = useTenant();
  const { cart, freight } = useCart();
  const talao = useTalao();
  const activeSession = talao?.activeSession ?? null;
  const { authUser } = useAuthUser();
  const gate = useTalaoClientGate();
  const [review, setReview] = useState<CartReview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Chave estável do conteúdo do carrinho — evita refetch por mudança de
  // referência do array sem mudança de conteúdo (mesmo idioma de
  // cartProductIdsKey em /carrinho).
  const cartKey = cart.map((item) => `${item.key}:${item.qty}`).join('|');

  useEffect(() => {
    if (cart.length === 0) return;
    let cancelled = false;
    // O carrinho mudou — a revisão anterior não vale mais enquanto a nova não chega.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReview(null);
    setLoadError(null);
    apiFetch('/api/cart-review', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: cart }),
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as unknown;
        if (!response.ok) {
          const message = payload && typeof payload === 'object' && 'error' in payload
            ? String(payload.error)
            : 'Não foi possível carregar a revisão do pedido.';
          throw new Error(message);
        }
        const parsed = CartReviewSchema.safeParse(payload);
        if (!parsed.success) throw new Error('A resposta da revisão veio em um formato inesperado.');
        if (!cancelled) setReview(parsed.data);
      })
      .catch((cause) => {
        if (!cancelled) setLoadError(cause instanceof Error ? cause.message : 'Não foi possível carregar a revisão do pedido.');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cartKey já resume cart pra evitar refetch por mudança de referência sem mudança de conteúdo
  }, [cartKey]);

  function handleContinue() {
    router.push(href('/frete'));
  }

  const reachable = freight ? 4 : cart.length > 0 ? 3 : 1;

  if (cart.length === 0) {
    return (
      <main className={`${publicUi.container} py-5 pb-14`}>
        <CheckoutSteps current="/revisao" reachable={1} />
        <h1 className="mb-5 text-2xl font-extrabold tracking-[-0.03em]">Revisão do pedido</h1>
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
        <CheckoutSteps current="/revisao" reachable={1} />
        <h1 className="mb-5 text-2xl font-extrabold tracking-[-0.03em]">Revisão do pedido</h1>
        <div className="max-w-[420px]">
          <p className="mb-4 text-sm text-brand-muted">Para revisar o pedido você precisa entrar ou criar uma conta — seu carrinho continua salvo.</p>
          <div className={publicUi.checkoutActions}>
            <Link href={`/login?redirect=${encodeURIComponent('/revisao')}`} className={publicUi.primaryButton}>Entrar</Link>
            <Link href={`/cadastro?redirect=${encodeURIComponent('/revisao')}`} className={publicUi.subtleButton}>Criar conta</Link>
          </div>
        </div>
      </main>
    );
  }

  if (gate.blocked) {
    return (
      <main className={`${publicUi.container} py-5 pb-14`}>
        <CheckoutSteps current="/revisao" reachable={3} />
        <h1 className="mb-5 text-2xl font-extrabold tracking-[-0.03em]">Revisão do pedido</h1>
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

  // Igual a /frete: o pedido pode ter sido finalizado em /pagamento (outra
  // aba/dispositivo) enquanto esta tela ainda está aberta.
  if (activeSession?.status === 'fechado') {
    return (
      <main className={`${publicUi.container} py-5 pb-14`}>
        <CheckoutSteps current="/revisao" reachable={4} />
        <h1 className="mb-5 text-2xl font-extrabold tracking-[-0.03em]">Revisão do pedido</h1>
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
      <CheckoutSteps current="/revisao" reachable={reachable} />
      <h1 className="mb-5 text-2xl font-extrabold tracking-[-0.03em]">Revisão do pedido</h1>

      {/* Os grupos por categoria vêm de uma rota sem IA e sempre renderizam,
          mesmo se a sugestão de IA abaixo estiver indisponível. */}
      {loadError && (
        <p className="mb-4 max-w-[420px] text-sm text-danger" role="alert">{loadError}</p>
      )}
      {review && <CartReviewGroups groups={review.groups} cart={cart} />}

      <div className="mt-4">
        <CartReviewInsightCard items={cart} />
      </div>

      <div className={`${publicUi.checkoutActions} mt-4`}>
        <button className={publicUi.primaryButton} onClick={handleContinue}>
          Continuar para a entrega
        </button>
      </div>

      <Link href="/carrinho" className={publicUi.backLink}><ArrowLeft className="size-4" aria-hidden="true" />Voltar ao carrinho</Link>
    </main>
  );
}
