'use client';

import { useEffect, useRef, useState } from 'react';
import Link from '@/components/TenantLink';
import { Button } from '@/components/ui/button';
import { HubHeader } from '@/workspace/components/shared/HubHeader';
import { fetchUsers } from '@/workspace/lib/usersClient';
import type { AdminUser } from '@/domain/clients/types';
import {
  associateWhatsAppSenderProfile,
  BIPPA_MESSAGING_ORIGIN,
  ensureWhatsAppInstallation,
  fetchTenantWhatsAppConnectionStatuses,
  fetchWhatsAppConnections,
  isTrustedBippaMessagingOrigin,
  startWhatsAppOnboardingAttempt,
  type TenantWhatsAppConnectionStatus,
  type WhatsAppConnectionOption,
} from '@/workspace/lib/whatsappIntegrationClient';
import { IntegrationRulesCard } from './IntegrationRulesCard';

// Espelha MercadoPagoIntegrationApp.tsx na estrutura (HubHeader,
// IntegrationRulesCard), mas o fluxo de conexão é diferente: em vez de
// navegação completa do browser para uma URL hospedada, aqui é um popup +
// postMessage (Embedded Signup mediado pelo bippa-messaging) -- por isso a
// validação de origem é a parte mais sensível deste arquivo (ver
// isTrustedBippaMessagingOrigin).
//
// Cada VENDEDORA tem seu próprio número -- esta tela lista as vendedoras da
// loja e o status de conexão de cada uma; é a administradora quem conecta em
// nome de cada uma (confirmado com o usuário), não a própria vendedora.

type Status = 'disconnected' | 'connecting' | 'connected' | 'error';

const POPUP_FEATURES = 'width=480,height=720';
// O contrato do bippa-messaging não confirma que `bippa.meta.onboarding.ready`
// sempre é emitido (ver gap documentado em
// backend/docs/whatsapp-bippa-messaging.md) -- por isso a mensagem de início
// também é mandada por este timeout, caso o popup nunca sinalize "pronto".
const READY_FALLBACK_MS = 4_000;
// Se nada (completed/failed) chegar depois de mandar o início, evita deixar
// a tela presa em "Conectando…" para sempre -- surge um erro explícito.
const ONBOARDING_TIMEOUT_MS = 90_000;

export default function WhatsAppIntegrationApp() {
  const [sellers, setSellers] = useState<AdminUser[]>([]);
  const [connectionsBySeller, setConnectionsBySeller] = useState<Record<string, TenantWhatsAppConnectionStatus>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Estado do fluxo de conexão em curso -- só UMA vendedora por vez pode
  // estar sendo conectada (o popup é modal por natureza).
  const [activeSellerId, setActiveSellerId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('disconnected');
  const [pending, setPending] = useState(false);
  const [phoneOptions, setPhoneOptions] = useState<WhatsAppConnectionOption[]>([]);
  const [associatingPhoneId, setAssociatingPhoneId] = useState<string | null>(null);

  // Mensagem de status por vendedora -- cobre tanto o fluxo de onboarding
  // (activeSellerId) quanto a ação independente "Verificar conexão", que
  // pode rodar para uma vendedora diferente da que está em onboarding.
  const [messageSellerId, setMessageSellerId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);
  const [verifyingSellerId, setVerifyingSellerId] = useState<string | null>(null);

  function showMessage(sellerId: string, text: string | null, isError = false) {
    setMessageSellerId(sellerId);
    setMessage(text);
    setMessageIsError(isError);
  }

  const attemptStateRef = useRef<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const listenerRef = useRef<((event: MessageEvent) => void) | null>(null);
  const readyFallbackTimerRef = useRef<number | null>(null);
  const onboardingTimeoutTimerRef = useRef<number | null>(null);
  const startSentRef = useRef(false);

  async function refresh() {
    setLoading(true);
    setLoadError(null);
    try {
      const [users, statuses] = await Promise.all([fetchUsers(), fetchTenantWhatsAppConnectionStatuses()]);
      setSellers(users.filter((u) => u.role === 'vendedora'));
      setConnectionsBySeller(Object.fromEntries(statuses.map((s) => [s.sellerId, s])));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Não foi possível carregar a integração do WhatsApp.');
    } finally {
      setLoading(false);
    }
  }

  function teardownOnboardingListeners() {
    if (listenerRef.current) {
      window.removeEventListener('message', listenerRef.current);
      listenerRef.current = null;
    }
    if (readyFallbackTimerRef.current !== null) {
      window.clearTimeout(readyFallbackTimerRef.current);
      readyFallbackTimerRef.current = null;
    }
    if (onboardingTimeoutTimerRef.current !== null) {
      window.clearTimeout(onboardingTimeoutTimerRef.current);
      onboardingTimeoutTimerRef.current = null;
    }
  }

  useEffect(() => {
    // Dispara depois do primeiro paint -- mesmo padrão de
    // MercadoPagoIntegrationApp.tsx, evita setState síncrono dentro do
    // corpo do efeito (cascading renders).
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => {
      window.clearTimeout(timer);
      teardownOnboardingListeners();
      popupRef.current?.close();
    };
  }, []);

  async function startOnboarding(sellerId: string) {
    setActiveSellerId(sellerId);
    setPending(true);
    setStatus('connecting');
    showMessage(sellerId, null);
    setPhoneOptions([]);
    try {
      await ensureWhatsAppInstallation(sellerId);
      const attempt = await startWhatsAppOnboardingAttempt(sellerId);
      attemptStateRef.current = attempt.state;

      const popup = window.open(attempt.connectUrl, 'bippa-onboarding', POPUP_FEATURES);
      if (!popup) {
        throw new Error('Não foi possível abrir a janela de conexão. Verifique se o bloqueador de pop-ups está desativado.');
      }
      popupRef.current = popup;
      startSentRef.current = false;

      // Manda `onboarding.start` uma única vez, seja pelo sinal
      // `bippa.meta.onboarding.ready` do popup, seja pelo fallback abaixo
      // -- o contrato do bippa-messaging não confirma que `ready` é sempre
      // emitido (ver gap documentado em
      // backend/docs/whatsapp-bippa-messaging.md), então não dá para
      // depender só dele.
      //
      // Só `state` -- confirmado contra o script real do bippa-messaging
      // (/meta/embedded-signup): não é enviado access_token nem qualquer
      // token de sessão do admin. O popup resolve o login com a Meta
      // sozinho (FB.login) e conclui chamando POST
      // /v1/admin/onboarding/complete autenticado só por essa `state`
      // (uso único, expira em 10min) -- rota fora do middleware de API key
      // porque roda no navegador e nunca pode ver a key de serviço do
      // Catálogo.
      function sendStartMessage() {
        if (startSentRef.current) return;
        startSentRef.current = true;
        popup!.postMessage({ type: 'bippa.meta.onboarding.start', state: attemptStateRef.current }, BIPPA_MESSAGING_ORIGIN);
      }

      // O listener precisa estar registrado ANTES de qualquer mensagem
      // trocar de lado -- se registrássemos depois de mandar
      // `onboarding.start`, uma resposta rápida do popup poderia chegar
      // sem ninguém ouvindo.
      teardownOnboardingListeners();
      const handler = (event: MessageEvent) => {
        // Descarta IMEDIATAMENTE qualquer evento de origem que não seja o
        // bippa-messaging -- nunca confiar em `event.data` antes de
        // confirmar `event.origin`.
        if (!isTrustedBippaMessagingOrigin(event.origin)) return;
        const data = event.data as { type?: string; state?: string } | undefined;
        if (!data?.type) return;

        if (data.type === 'bippa.meta.onboarding.ready') {
          sendStartMessage();
          return;
        }

        if (data.type === 'bippa.meta.onboarding.completed') {
          if (data.state && data.state !== attemptStateRef.current) return; // resposta de uma tentativa antiga -- ignora
          popup.close();
          teardownOnboardingListeners();
          void (async () => {
            try {
              const connections = await fetchWhatsAppConnections();
              setPhoneOptions(connections);
              setStatus(connections.length > 0 ? 'disconnected' : 'error');
              showMessage(
                sellerId,
                connections.length > 0
                  ? 'Conexão concluída. Escolha o telefone que representa esta vendedora para finalizar.'
                  : 'A conexão foi concluída, mas nenhum telefone foi encontrado nesta conta.',
                connections.length === 0,
              );
            } catch (error) {
              setStatus('error');
              showMessage(sellerId, error instanceof Error ? error.message : 'Não foi possível listar os telefones conectados.', true);
            } finally {
              setPending(false);
            }
          })();
          return;
        }

        if (data.type === 'bippa.meta.onboarding.failed') {
          popup.close();
          teardownOnboardingListeners();
          setStatus('error');
          showMessage(sellerId, 'Não foi possível concluir a conexão com o WhatsApp. Tente novamente.', true);
          setPending(false);
        }
      };
      listenerRef.current = handler;
      window.addEventListener('message', handler);

      // Fallback: se `ready` não chegar em READY_FALLBACK_MS, manda o
      // início mesmo assim (o popup já teve tempo de terminar de carregar
      // na esmagadora maioria dos casos).
      readyFallbackTimerRef.current = window.setTimeout(sendStartMessage, READY_FALLBACK_MS);

      // Guarda-chuva: se nada (completed/failed) chegar depois disso, para
      // de deixar a tela presa em "Conectando…" e mostra um erro explícito.
      onboardingTimeoutTimerRef.current = window.setTimeout(() => {
        popup.close();
        teardownOnboardingListeners();
        setStatus('error');
        showMessage(sellerId, 'A conexão com o WhatsApp demorou demais para responder. Tente novamente.', true);
        setPending(false);
      }, ONBOARDING_TIMEOUT_MS);
    } catch (error) {
      setStatus('error');
      showMessage(sellerId, error instanceof Error ? error.message : 'Não foi possível iniciar a conexão com o WhatsApp.', true);
      setPending(false);
    }
  }

  async function selectPhone(phoneId: string) {
    if (!activeSellerId) return;
    const sellerId = activeSellerId;
    setAssociatingPhoneId(phoneId);
    showMessage(sellerId, null);
    try {
      const result = await associateWhatsAppSenderProfile(sellerId, phoneId);
      // Só muda para "conectado" a partir da resposta confirmada -- nunca
      // otimista.
      setConnectionsBySeller((prev) => ({ ...prev, [sellerId]: result }));
      setStatus(result.connected ? 'connected' : 'error');
      setPhoneOptions([]);
      showMessage(sellerId, result.connected ? null : 'A vendedora aceitou o telefone, mas a conexão ainda não está confirmada.', !result.connected);
    } catch (error) {
      setStatus('error');
      showMessage(sellerId, error instanceof Error ? error.message : 'Não foi possível associar este telefone à vendedora.', true);
    } finally {
      setAssociatingPhoneId(null);
      setPending(false);
    }
  }

  async function verifyConnection(sellerId: string) {
    setVerifyingSellerId(sellerId);
    showMessage(sellerId, null);
    try {
      const connection = connectionsBySeller[sellerId];
      const connections = await fetchWhatsAppConnections();
      const match = connections.find(
        (entry) => entry.phoneId === connection?.phoneId && entry.senderProfileKey === connection?.senderProfileKey,
      );
      showMessage(
        sellerId,
        match
          ? `Conexão confirmada: ${match.displayPhoneMasked ?? match.phoneId} está vinculado a esta vendedora.`
          : 'Não foi possível confirmar o vínculo deste telefone com a vendedora no bippa-messaging.',
        !match,
      );
    } catch (error) {
      showMessage(sellerId, error instanceof Error ? error.message : 'Não foi possível verificar a conexão.', true);
    } finally {
      setVerifyingSellerId(null);
    }
  }

  const STATUS_LABEL: Record<Status, string> = {
    disconnected: 'Não conectado',
    connecting: 'Conectando…',
    connected: 'Conectado',
    error: 'Erro na conexão',
  };

  return (
    <div className="min-h-screen bg-brand-background">
      <HubHeader
        title="WhatsApp"
        description="Conecte o número de WhatsApp Business de cada vendedora (via bippa-messaging) para notificar pedidos e links de pagamento."
        secondaryActions={<Link href="/workspace/integracoes" className="text-sm font-medium text-brand-primary">Voltar às integrações</Link>}
      />

      <main className="mx-auto flex max-w-3xl flex-col gap-5 p-4 sm:p-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando vendedoras…</p>
        ) : loadError ? (
          <p className="text-sm text-red-700">{loadError}</p>
        ) : sellers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma vendedora cadastrada ainda -- crie uma em Usuários antes de conectar um número de WhatsApp.
          </p>
        ) : (
          <>
            {sellers.map((seller) => {
              const connection = connectionsBySeller[seller.id];
              const isActive = activeSellerId === seller.id;
              const sellerStatus: Status = isActive ? status : connection?.connected ? 'connected' : 'disconnected';
              return (
                <section key={seller.id} className="rounded-brand border border-border bg-surface p-5 shadow-card">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="font-bold text-foreground">{seller.name}</h2>
                      <p className="text-xs text-muted-foreground">{seller.email}</p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        sellerStatus === 'connected'
                          ? 'bg-emerald-50 text-emerald-900'
                          : sellerStatus === 'error'
                            ? 'bg-red-50 text-red-900'
                            : 'bg-brand-background text-brand-text'
                      }`}
                    >
                      {STATUS_LABEL[sellerStatus]}
                    </span>
                  </div>

                  {connection?.connected && (
                    <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
                      {connection.displayPhoneMasked && (
                        <div>
                          <dt>Telefone</dt>
                          <dd><code>{connection.displayPhoneMasked}</code></dd>
                        </div>
                      )}
                      {connection.verifiedName && (
                        <div>
                          <dt>Nome verificado</dt>
                          <dd>{connection.verifiedName}</dd>
                        </div>
                      )}
                    </dl>
                  )}

                  {isActive && phoneOptions.length > 0 && (
                    <div className="mt-4 rounded-control border border-border p-3">
                      <p className="text-xs text-muted-foreground">
                        A conta conectada pode ter mais de um número. Selecione o que representa esta vendedora.
                      </p>
                      <ul className="mt-2 flex flex-col gap-2">
                        {phoneOptions.map((option) => (
                          <li key={option.phoneId} className="flex items-center justify-between gap-3 rounded-control border border-border p-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">{option.displayPhoneMasked ?? option.phoneId}</p>
                              {option.verifiedName && <p className="truncate text-xs text-muted-foreground">{option.verifiedName}</p>}
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              disabled={associatingPhoneId !== null}
                              loading={associatingPhoneId === option.phoneId}
                              onClick={() => void selectPhone(option.phoneId)}
                            >
                              Usar este telefone
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      disabled={pending && !isActive}
                      loading={isActive && sellerStatus === 'connecting'}
                      onClick={() => void startOnboarding(seller.id)}
                    >
                      {connection?.connected ? 'Reconectar WhatsApp' : 'Conectar WhatsApp'}
                    </Button>
                    {connection?.connected && (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={verifyingSellerId !== null}
                        loading={verifyingSellerId === seller.id}
                        onClick={() => void verifyConnection(seller.id)}
                      >
                        Verificar conexão
                      </Button>
                    )}
                  </div>
                  {messageSellerId === seller.id && message && (
                    <p className={`mt-3 text-sm ${messageIsError ? 'text-red-700' : 'text-muted-foreground'}`} role="status">
                      {message}
                    </p>
                  )}
                </section>
              );
            })}

            <IntegrationRulesCard
              description="A conexão é autorizada num popup hospedado pelo bippa-messaging e volta para esta tela ao terminar."
              rules={[
                { title: 'Um número por vendedora', description: 'Cada vendedora tem no máximo um telefone conectado -- é ele que a vendedora usa para notificar pedidos e links de pagamento dos clientes da própria carteira.' },
                { title: 'Sem credenciais aqui', description: 'Token, WABA ID e demais credenciais da Meta ficam só no bippa-messaging -- este painel nunca os armazena nem exibe.' },
                { title: 'Cobrança pelo WhatsApp (Meta Payments)', description: 'A opção de cobrar diretamente pelo WhatsApp fica desligada até a aprovação do recurso pela Meta -- não há como ativá-la por aqui ainda.' },
                { title: 'Confirmação explícita', description: 'O status só muda para "conectado" depois que o bippa-messaging confirma a associação do telefone -- nunca antes disso.' },
              ]}
            />
          </>
        )}
      </main>
    </div>
  );
}
