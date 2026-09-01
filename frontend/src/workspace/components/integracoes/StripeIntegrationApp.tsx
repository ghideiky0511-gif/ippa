'use client';

import { useEffect, useState } from 'react';
import Link from '@/components/TenantLink';
import { Button } from '@/components/ui/button';
import { HubHeader } from '@/workspace/components/shared/HubHeader';
import {
  createStripeOnboardingLink,
  disconnectStripeAccount,
  fetchPaymentIntegrations,
  refreshStripeOnboardingStatus,
  testPaymentIntegrationConnection,
  type PaymentIntegrationOption,
  type StripeOnboardingStatusResult,
} from '@/workspace/lib/paymentIntegrationClient';
import { useTenant } from '@/components/TenantProvider';

type Status = 'not_started' | 'pending' | 'complete' | 'restricted';

function statusFor(option: PaymentIntegrationOption | null): Status {
  if (!option?.stripeAccountId) return 'not_started';
  if (option.stripeOnboardingStatus === 'complete' && option.active) return 'complete';
  if (option.stripeOnboardingStatus === 'restricted') return 'restricted';
  return 'pending';
}

const STATUS_COPY: Record<Status, { title: string; body: string; className: string }> = {
  not_started: {
    title: 'Conta ainda não conectada',
    body: 'Inicie o cadastro para criar a conta Stripe Connect desta loja.',
    className: 'border-border bg-brand-background text-brand-text',
  },
  pending: {
    title: 'Cadastro pendente',
    body: 'Conclua ou revise os dados solicitados pela Stripe. A ativação ocorre quando a Stripe confirmar que a conta pode receber cobranças.',
    className: 'border-amber-200 bg-amber-50 text-amber-900',
  },
  complete: {
    title: 'Stripe conectada e ativa',
    body: 'Esta loja já pode receber cobranças com a conta Connect vinculada.',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  },
  restricted: {
    title: 'A Stripe exige atenção',
    body: 'Abra o cadastro para atender aos requisitos pendentes informados pela Stripe.',
    className: 'border-red-200 bg-red-50 text-red-900',
  },
};

export default function StripeIntegrationApp() {
  const { href } = useTenant();
  const [option, setOption] = useState<PaymentIntegrationOption | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [requirements, setRequirements] = useState<StripeOnboardingStatusResult['requirements'] | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const result = await fetchPaymentIntegrations();
      setOption(result.options.find((item) => item.provider === 'stripe') ?? null);
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível carregar a integração da Stripe.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Dispara a leitura depois do primeiro paint; assim o efeito só inicia a
    // operação assíncrona e as atualizações de estado ficam no callback.
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function startOnboarding() {
    setPending(true);
    setMessage(null);
    try {
      // O retorno precisa apontar para a URL pública da loja para que a
      // administradora volte ao mesmo tenant depois do fluxo hospedado.
      const returnUrl = `${window.location.origin}${href('/workspace/integracoes/stripe')}`;
      const result = await createStripeOnboardingLink(returnUrl);
      window.location.assign(result.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível abrir o cadastro da Stripe.');
      setPending(false);
    }
  }

  async function testConnection() {
    setPending(true);
    setMessage(null);
    try {
      const result = await testPaymentIntegrationConnection('stripe');
      setMessage(result.ok ? 'Conexão com a conta Stripe confirmada.' : result.message ?? 'Não foi possível confirmar a conexão.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível testar a conexão.');
    } finally {
      setPending(false);
    }
  }

  async function replaceStripeAccount() {
    const currentAccountId = option?.stripeAccountId;
    if (!currentAccountId) return;
    const confirmed = window.confirm(
      `Trocar a conta ${currentAccountId}? A conta não será apagada na Stripe, mas deixará de estar vinculada a esta loja. Uma nova conta Connect será criada na plataforma Stripe atual.`
    );
    if (!confirmed) return;

    setPending(true);
    setMessage(null);
    try {
      await disconnectStripeAccount();
      setRequirements(null);
      await refresh();
      const returnUrl = `${window.location.origin}${href('/workspace/integracoes/stripe')}`;
      const result = await createStripeOnboardingLink(returnUrl);
      window.location.assign(result.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível trocar a conta Stripe.');
      setPending(false);
    }
  }

  async function refreshFromStripe() {
    setPending(true);
    setMessage(null);
    try {
      const result = await refreshStripeOnboardingStatus();
      setRequirements(result.requirements);
      await refresh();
      if (result.status === 'complete' && result.active) {
        setMessage('A Stripe confirmou que esta conta está pronta para receber pagamentos.');
      } else {
        setMessage('Status consultado diretamente na Stripe. Revise as pendências abaixo, se houver.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível atualizar o status na Stripe.');
    } finally {
      setPending(false);
    }
  }

  const status = statusFor(option);
  const statusCopy = STATUS_COPY[status];
  const actionLabel = status === 'not_started'
    ? 'Conectar conta Stripe'
    : status === 'pending'
      ? 'Continuar cadastro na Stripe'
      : 'Revisar cadastro na Stripe';

  return (
    <div className="min-h-screen bg-brand-background">
      <HubHeader
        title="Stripe"
        description="Conecte a conta da loja para receber pagamentos diretamente pela Stripe."
        secondaryActions={<Link href="/workspace/integracoes" className="text-sm font-medium text-brand-primary">Voltar às integrações</Link>}
      />

      <main className="mx-auto flex max-w-3xl flex-col gap-5 p-4 sm:p-6">
        <section className="rounded-brand border border-border bg-surface p-5 shadow-card">
          <div className="flex flex-wrap items-center gap-4">
            <img
              src="https://cdn.brandfetch.io/idxAg10C0L/w/480/h/480/theme/dark/icon.jpeg?c=1dxbfHSJFAPEGdCLU4o5B"
              alt="Stripe"
              width={56}
              height={56}
              className="size-14 shrink-0 rounded-xl object-cover"
            />
            <div>
              <h2 className="font-bold text-foreground">Stripe Connect</h2>
              <p className="mt-1 text-sm text-muted-foreground">O cadastro, a verificação de identidade e os dados bancários são preenchidos em ambiente seguro da Stripe.</p>
            </div>
          </div>
        </section>

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando configuração da Stripe…</p>
        ) : (
          <>
            <section className={`rounded-brand border p-5 ${statusCopy.className}`}>
              <h2 className="font-bold">{statusCopy.title}</h2>
              <p className="mt-1 text-sm leading-6">{statusCopy.body}</p>
              {option?.stripeAccountId && <p className="mt-3 text-xs opacity-80">Conta conectada: <code>{option.stripeAccountId}</code></p>}
              {requirements && (requirements.disabledReason || requirements.currentlyDue.length > 0 || requirements.pastDue.length > 0) && (
                <div className="mt-3 text-sm">
                  <p className="font-medium">Pendências informadas pela Stripe</p>
                  {requirements.disabledReason && <p className="mt-1">Motivo: <code>{requirements.disabledReason}</code></p>}
                  {requirements.currentlyDue.length > 0 && <p className="mt-1">Necessário agora: <code>{requirements.currentlyDue.join(', ')}</code></p>}
                  {requirements.pastDue.length > 0 && <p className="mt-1">Em atraso: <code>{requirements.pastDue.join(', ')}</code></p>}
                </div>
              )}
            </section>

            <section className="rounded-brand border border-border bg-surface p-5">
              <h2 className="font-bold text-foreground">Configuração da loja</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Não há chaves para preencher aqui. Esta página vincula somente a conta Connect desta loja; as chaves da API e do webhook pertencem à plataforma ippa e ficam protegidas no backend.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {status !== 'complete' && <Button type="button" disabled={pending} onClick={() => void startOnboarding()}>{pending ? 'Abrindo Stripe…' : actionLabel}</Button>}
                {option?.stripeAccountId && <Button type="button" variant="outline" disabled={pending} onClick={() => void replaceStripeAccount()}>Trocar conta Stripe</Button>}
                {option?.stripeAccountId && <Button type="button" variant="outline" disabled={pending} onClick={() => void testConnection()}>Testar conexão</Button>}
                <Button type="button" variant="outline" disabled={loading || pending} onClick={() => void refreshFromStripe()}>{pending ? 'Consultando Stripe…' : 'Atualizar status na Stripe'}</Button>
              </div>
              {message && <p className="mt-3 text-sm text-muted-foreground" role="status">{message}</p>}
            </section>

            <p className="text-xs leading-5 text-muted-foreground">
              A conta só aparece como ativa depois que o webhook da Stripe confirmar a conclusão do onboarding. Nenhuma chave secreta é exibida ou armazenada por tenant.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
