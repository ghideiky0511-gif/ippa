'use client';

import { useEffect, useState } from 'react';
import Link from '@/components/TenantLink';
import { Button } from '@/components/ui/button';
import { HubHeader } from '@/workspace/components/shared/HubHeader';
import {
  createMercadoPagoOnboardingLink,
  disconnectMercadoPagoAccount,
  fetchMercadoPagoAccountSummary,
  fetchPaymentIntegrations,
  testPaymentIntegrationConnection,
  type MercadoPagoAccountSummary,
  type PaymentIntegrationOption,
} from '@/workspace/lib/paymentIntegrationClient';
import { useTenant } from '@/components/TenantProvider';
import { IntegrationRulesCard } from './IntegrationRulesCard';

// Espelha StripeIntegrationApp.tsx, mas mais simples num ponto central: a
// ativação do Mercado Pago é síncrona no callback OAuth (a troca do code JÁ
// é a confirmação de onboarding, ver mercadoPagoOnboardingService.ts) --
// não existe um status intermediário "pending" nem um "Atualizar status"
// pra consultar depois, só "conectada" ou "não conectada".

type Status = 'not_connected' | 'connected_active' | 'connected_inactive';

function statusFor(option: PaymentIntegrationOption | null): Status {
  if (!option?.mercadoPagoUserId) return 'not_connected';
  return option.active ? 'connected_active' : 'connected_inactive';
}

const STATUS_COPY: Record<Status, { title: string; body: string; className: string }> = {
  not_connected: {
    title: 'Conta ainda não conectada',
    body: 'Conecte a conta Mercado Pago desta loja para receber pagamentos com Pix e cartão.',
    className: 'border-border bg-brand-background text-brand-text',
  },
  connected_inactive: {
    title: 'Conectada, mas não é o gateway ativo',
    body: 'Esta loja tem uma conta Mercado Pago vinculada, mas outro provedor está ativo agora (só um gateway por vez). Reconecte para ativá-la.',
    className: 'border-amber-200 bg-amber-50 text-amber-900',
  },
  connected_active: {
    title: 'Mercado Pago conectado e ativo',
    body: 'Esta loja já pode receber cobranças com Pix e cartão pela conta vinculada.',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  },
};

export default function MercadoPagoIntegrationApp() {
  const { href } = useTenant();
  const [option, setOption] = useState<PaymentIntegrationOption | null>(null);
  const [account, setAccount] = useState<MercadoPagoAccountSummary | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const result = await fetchPaymentIntegrations();
      const found = result.options.find((item) => item.provider === 'mercadopago') ?? null;
      setOption(found);
      setMessage(null);
      if (found?.mercadoPagoUserId) {
        // Chamada separada (não bloqueia o carregamento do status acima) --
        // uma falha aqui não deveria impedir de ver se a loja está
        // conectada, só a ficha de identificação da conta.
        try {
          setAccount(await fetchMercadoPagoAccountSummary());
          setAccountError(null);
        } catch (error) {
          setAccount(null);
          setAccountError(error instanceof Error ? error.message : 'Não foi possível carregar os dados da conta.');
        }
      } else {
        setAccount(null);
        setAccountError(null);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível carregar a integração do Mercado Pago.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Dispara depois do primeiro paint; assim o efeito só inicia a operação
    // (leitura da URL + fetch) e as atualizações de estado ficam nos
    // callbacks, nunca síncronas no corpo do efeito.
    const timer = window.setTimeout(() => {
      // ?mpError=1 é adicionado pelo callback OAuth quando a conexão falha
      // (ver app/api/webhooks/mercadopago/oauth-callback/route.ts) -- limpa
      // da URL depois de ler, pra não reaparecer numa atualização de página.
      if (new URLSearchParams(window.location.search).get('mpError')) {
        setMessage('Não foi possível concluir a conexão com o Mercado Pago. Tente novamente.');
        window.history.replaceState(null, '', window.location.pathname);
      }
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
      const returnUrl = `${window.location.origin}${href('/workspace/integracoes/mercadopago')}`;
      const result = await createMercadoPagoOnboardingLink(returnUrl);
      window.location.assign(result.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível abrir a conexão com o Mercado Pago.');
      setPending(false);
    }
  }

  async function testConnection() {
    setPending(true);
    setMessage(null);
    try {
      const result = await testPaymentIntegrationConnection('mercadopago');
      setMessage(result.ok ? 'Conexão com a conta Mercado Pago confirmada.' : result.message ?? 'Não foi possível confirmar a conexão.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível testar a conexão.');
    } finally {
      setPending(false);
    }
  }

  async function disconnect() {
    const confirmed = window.confirm('Desconectar a conta Mercado Pago desta loja? Ela deixa de ser o gateway ativo.');
    if (!confirmed) return;
    setPending(true);
    setMessage(null);
    try {
      await disconnectMercadoPagoAccount();
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível desvincular a conta Mercado Pago.');
    } finally {
      setPending(false);
    }
  }

  const status = statusFor(option);
  const statusCopy = STATUS_COPY[status];

  return (
    <div className="min-h-screen bg-brand-background">
      <HubHeader
        title="Mercado Pago"
        description="Conecte a conta da loja para receber pagamentos com Pix e cartão pelo Mercado Pago."
        secondaryActions={<Link href="/workspace/integracoes" className="text-sm font-medium text-brand-primary">Voltar às integrações</Link>}
      />

      <main className="mx-auto flex max-w-3xl flex-col gap-5 p-4 sm:p-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando configuração do Mercado Pago…</p>
        ) : (
          <>
            <section className={`rounded-brand border p-5 ${statusCopy.className}`}>
              <h2 className="font-bold">{statusCopy.title}</h2>
              <p className="mt-1 text-sm leading-6">{statusCopy.body}</p>
              {option?.mercadoPagoUserId && (
                <p className="mt-3 text-xs opacity-80">
                  Conta conectada: <code>{option.mercadoPagoUserId}</code>
                </p>
              )}
            </section>

            {option?.mercadoPagoUserId && (
              <section className="rounded-brand border border-border bg-surface p-5 shadow-card">
                <div className="flex flex-wrap items-center gap-4">
                  <img
                    src="https://cdn.brandfetch.io/idnLXhq0AN/w/820/h/820/theme/dark/icon.jpeg"
                    alt="Mercado Pago"
                    width={56}
                    height={56}
                    className="size-14 shrink-0 rounded-xl object-cover"
                  />
                  <div className="min-w-0">
                    <h2 className="font-bold text-foreground">
                      {account ? [account.firstName, account.lastName].filter(Boolean).join(' ') || account.nickname || 'Conta verificada' : 'Verificando conta…'}
                    </h2>
                    {account?.nickname && <p className="text-sm text-muted-foreground">@{account.nickname}</p>}
                  </div>
                </div>
                {account && (
                  <dl className="mt-4 grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                    {account.email && (
                      <div>
                        <dt className="text-xs text-muted-foreground">E-mail</dt>
                        <dd className="text-foreground">{account.email}</dd>
                      </div>
                    )}
                    {account.documentNumberMasked && (
                      <div>
                        <dt className="text-xs text-muted-foreground">Documento{account.documentType ? ` (${account.documentType})` : ''}</dt>
                        <dd className="text-foreground"><code>{account.documentNumberMasked}</code></dd>
                      </div>
                    )}
                    {account.siteStatus && (
                      <div>
                        <dt className="text-xs text-muted-foreground">Situação da conta</dt>
                        <dd className="text-foreground">{account.siteStatus}</dd>
                      </div>
                    )}
                  </dl>
                )}
                {accountError && <p className="mt-3 text-sm text-red-700" role="status">{accountError}</p>}
              </section>
            )}

            <section className="rounded-brand border border-border bg-surface p-5">
              <h2 className="font-bold text-foreground">Configuração da loja</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Não há chaves para preencher aqui. Esta página vincula somente a conta desta loja; a comissão
                da plataforma é aplicada automaticamente em cada cobrança.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" disabled={pending} onClick={() => void startOnboarding()}>
                  {pending
                    ? 'Abrindo Mercado Pago…'
                    : status === 'not_connected'
                      ? 'Conectar conta Mercado Pago'
                      : 'Reconectar conta Mercado Pago'}
                </Button>
                {option?.mercadoPagoUserId && (
                  <Button type="button" variant="outline" disabled={pending} onClick={() => void testConnection()}>
                    Testar conexão
                  </Button>
                )}
                {option?.mercadoPagoUserId && (
                  <Button type="button" variant="outline" disabled={pending} onClick={() => void disconnect()}>
                    Desconectar
                  </Button>
                )}
              </div>
              {message && <p className="mt-3 text-sm text-muted-foreground" role="status">{message}</p>}
            </section>

            <IntegrationRulesCard
              description="A conexão é autorizada no ambiente do Mercado Pago e volta para esta loja ao terminar."
              rules={[
                { title: 'Uma conta por loja', description: 'A conta conectada identifica a loja que receberá as cobranças via Pix e cartão.' },
                { title: 'Gateway ativo', description: 'Somente um gateway de pagamento pode estar ativo por vez. Ao conectar o Mercado Pago, ele passa a ser o gateway da loja.' },
                { title: 'Tokens protegidos', description: 'A autorização da conta é armazenada de forma protegida no backend; nenhum token é mostrado nesta tela.' },
                { title: 'Reconexão', description: 'Se a autorização expirar ou a conta mudar, reconecte a conta e teste a conexão antes de realizar novas cobranças.' },
              ]}
            />
          </>
        )}
      </main>
    </div>
  );
}
