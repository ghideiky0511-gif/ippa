// @ts-nocheck
'use client';
import { adminUi } from '@/workspace/lib/ui';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { HubHeader } from '@/workspace/components/shared/HubHeader';
import {
  activateErpIntegration,
  deactivateErpIntegration,
  testErpIntegrationConnection,
} from '@/workspace/lib/erpIntegrationClient';
import {
  activatePaymentIntegration,
  deactivatePaymentIntegration,
  testPaymentIntegrationConnection,
} from '@/workspace/lib/paymentIntegrationClient';
import ErpProviderCredentialsModal from './ErpProviderCredentialsModal';
import PaymentProviderCredentialsModal from './PaymentProviderCredentialsModal';

// Página central de integrações — seção "Sistema ERP" (catálogo original) e
// "Pagamento" (gateway próprio do tenant: iugu, Mercado Pago etc. no
// registry) lado a lado, cada uma com seu próprio estado/handlers — um
// catálogo de outra categoria ganharia sua própria seção aqui do mesmo
// jeito, sem mexer nas demais. Salvar credenciais e ativar o provider são
// ações separadas em ambas (ver erp/erpIntegrationService.ts e
// payments/paymentIntegrationService.ts): "Ativar" só libera depois de um
// "Testar conexão" bem-sucedido nesta sessão — qualquer nova edição de
// credenciais invalida esse teste.
export default function IntegracoesApp({ initialOptions, initialPaymentOptions }) {
  const [options, setOptions] = useState(initialOptions || []);
  const [editingProvider, setEditingProvider] = useState(null);
  const [testState, setTestState] = useState({}); // { [provider]: { status, message } }
  const [pendingProvider, setPendingProvider] = useState(null);
  const [feedback, setFeedback] = useState(null); // { type: 'error' | 'success', text }
  const [providerToDeactivate, setProviderToDeactivate] = useState(null);

  const [paymentOptions, setPaymentOptions] = useState(initialPaymentOptions || []);
  const [editingPaymentProvider, setEditingPaymentProvider] = useState(null);
  const [paymentTestState, setPaymentTestState] = useState({});
  const [pendingPaymentProvider, setPendingPaymentProvider] = useState(null);
  const [paymentFeedback, setPaymentFeedback] = useState(null);
  const [paymentProviderToDeactivate, setPaymentProviderToDeactivate] = useState(null);

  const editing = options.find((o) => o.provider === editingProvider) || null;

  async function handleTest(provider) {
    setTestState((prev) => ({ ...prev, [provider]: { status: 'testing' } }));
    setFeedback(null);
    try {
      const result = await testErpIntegrationConnection(provider);
      setTestState((prev) => ({
        ...prev,
        [provider]: {
          status: result.ok ? 'ok' : 'error',
          message: result.ok ? 'Conexão confirmada.' : result.message || 'Não foi possível confirmar a conexão.',
        },
      }));
    } catch (err) {
      setTestState((prev) => ({ ...prev, [provider]: { status: 'error', message: err.message } }));
    }
  }

  async function handleActivate(provider) {
    setPendingProvider(provider);
    setFeedback(null);
    try {
      const updated = await activateErpIntegration(provider);
      setOptions((prev) => prev.map((o) => (o.provider === updated.provider ? updated : { ...o, active: false })));
      setFeedback({ type: 'success', text: `${updated.label} ativado como provedor de ERP desta loja.` });
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setPendingProvider(null);
    }
  }

  async function handleDeactivate(option) {
    setPendingProvider(option.provider);
    setFeedback(null);
    try {
      await deactivateErpIntegration();
      setOptions((prev) => prev.map((o) => ({ ...o, active: false })));
      setFeedback({ type: 'success', text: 'ERP desativado.' });
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setPendingProvider(null);
    }
  }

  function handleSaved(updated) {
    setOptions((prev) => prev.map((o) => (o.provider === updated.provider ? updated : o)));
    setTestState((prev) => ({ ...prev, [updated.provider]: { status: 'idle' } }));
    setEditingProvider(null);
    setFeedback({ type: 'success', text: `Credenciais de ${updated.label} salvas.` });
  }

  const editingPayment = paymentOptions.find((o) => o.provider === editingPaymentProvider) || null;

  async function handlePaymentTest(provider) {
    setPaymentTestState((prev) => ({ ...prev, [provider]: { status: 'testing' } }));
    setPaymentFeedback(null);
    try {
      const result = await testPaymentIntegrationConnection(provider);
      setPaymentTestState((prev) => ({
        ...prev,
        [provider]: {
          status: result.ok ? 'ok' : 'error',
          message: result.ok ? 'Conexão confirmada.' : result.message || 'Não foi possível confirmar a conexão.',
        },
      }));
    } catch (err) {
      setPaymentTestState((prev) => ({ ...prev, [provider]: { status: 'error', message: err.message } }));
    }
  }

  async function handlePaymentActivate(provider) {
    setPendingPaymentProvider(provider);
    setPaymentFeedback(null);
    try {
      const updated = await activatePaymentIntegration(provider);
      setPaymentOptions((prev) => prev.map((o) => (o.provider === updated.provider ? updated : { ...o, active: false })));
      setPaymentFeedback({ type: 'success', text: `${updated.label} ativado como gateway de pagamento desta loja.` });
    } catch (err) {
      setPaymentFeedback({ type: 'error', text: err.message });
    } finally {
      setPendingPaymentProvider(null);
    }
  }

  async function handlePaymentDeactivate(option) {
    setPendingPaymentProvider(option.provider);
    setPaymentFeedback(null);
    try {
      await deactivatePaymentIntegration();
      setPaymentOptions((prev) => prev.map((o) => ({ ...o, active: false })));
      setPaymentFeedback({ type: 'success', text: 'Gateway de pagamento desativado.' });
    } catch (err) {
      setPaymentFeedback({ type: 'error', text: err.message });
    } finally {
      setPendingPaymentProvider(null);
    }
  }

  function handlePaymentSaved(updated) {
    setPaymentOptions((prev) => prev.map((o) => (o.provider === updated.provider ? updated : o)));
    setPaymentTestState((prev) => ({ ...prev, [updated.provider]: { status: 'idle' } }));
    setEditingPaymentProvider(null);
    setPaymentFeedback({ type: 'success', text: `Credenciais de ${updated.label} salvas.` });
  }

  return (
    <div className={adminUi.page}>
      <HubHeader title="Integrações" />

      <main className={adminUi.productsEditor}>
        <h2>Sistema ERP</h2>
        <p className={adminUi.hint}>
          Escolha e configure o sistema de gestão usado para sincronizar produtos, pedidos, clientes e empresas
          desta loja.
        </p>
        {feedback && (
          <p className={adminUi.hint} style={feedback.type === 'error' ? { color: '#b00020' } : undefined}>
            {feedback.text}
          </p>
        )}

        <div className={adminUi.toolsList}>
          {options.map((option) => {
            const state = testState[option.provider] || { status: 'idle' };
            const isPending = pendingProvider === option.provider;
            return (
              <div key={option.provider} className={adminUi.toolRow}>
                <div className={adminUi.fieldRow}>
                  {option.logoPath && (
                    <img
                      src={option.logoPath}
                      alt=""
                      width={32}
                      height={32}
                      onError={(e) => {
                        e.currentTarget.hidden = true;
                      }}
                    />
                  )}
                  <strong>{option.label}</strong>
                  {option.active && <span className={adminUi.chipSuccess}>Ativo</span>}
                </div>
                <p className={adminUi.hint}>{option.description}</p>
                {option.configured && (
                  <p className={adminUi.hint}>
                    {option.active ? 'Provedor atual desta loja.' : 'Credenciais salvas, ainda não ativado.'}
                  </p>
                )}
                {state.status !== 'idle' && (
                  <p className={adminUi.hint} style={state.status === 'error' ? { color: '#b00020' } : undefined}>
                    {state.status === 'testing' ? 'Testando conexão...' : state.message}
                  </p>
                )}

                <div className={`${adminUi.fieldRow} flex-wrap`}>
                  <button type="button" className={adminUi.button} onClick={() => setEditingProvider(option.provider)}>
                    {option.configured ? 'Editar credenciais' : 'Configurar'}
                  </button>
                  {option.configured && (
                    <button
                      type="button"
                      className={adminUi.button}
                      disabled={state.status === 'testing'}
                      onClick={() => handleTest(option.provider)}
                    >
                      {state.status === 'testing' ? 'Testando…' : 'Testar conexão'}
                    </button>
                  )}
                  {option.configured && !option.active && (
                    <button
                      type="button"
                      className={adminUi.primaryButton}
                      disabled={state.status !== 'ok' || isPending}
                      onClick={() => handleActivate(option.provider)}
                    >
                      Ativar
                    </button>
                  )}
                  {option.active && (
                    <button
                      type="button"
                      className={adminUi.dangerButton}
                      disabled={isPending}
                      onClick={() => setProviderToDeactivate(option)}
                    >
                      Desativar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {options.length === 0 && <p className={adminUi.previewEmpty}>Nenhum provedor de ERP disponível.</p>}
      </main>

      <main className={adminUi.productsEditor}>
        <h2>Pagamento</h2>
        <p className={adminUi.hint}>
          Escolha e configure o gateway de pagamento (Pix, boleto, cartão) usado para cobrar as clientes desta loja.
          A ippa não fica com o dinheiro: a cobrança acontece direto na sua conta do provedor escolhido.
        </p>
        {paymentFeedback && (
          <p className={adminUi.hint} style={paymentFeedback.type === 'error' ? { color: '#b00020' } : undefined}>
            {paymentFeedback.text}
          </p>
        )}

        <div className={adminUi.toolsList}>
          {paymentOptions.map((option) => {
            const state = paymentTestState[option.provider] || { status: 'idle' };
            const isPending = pendingPaymentProvider === option.provider;
            return (
              <div key={option.provider} className={adminUi.toolRow}>
                <div className={adminUi.fieldRow}>
                  {option.logoPath && (
                    <img
                      src={option.logoPath}
                      alt=""
                      width={32}
                      height={32}
                      onError={(e) => {
                        e.currentTarget.hidden = true;
                      }}
                    />
                  )}
                  <strong>{option.label}</strong>
                  {option.active && <span className={adminUi.chipSuccess}>Ativo</span>}
                </div>
                <p className={adminUi.hint}>{option.description}</p>
                {option.configured && (
                  <p className={adminUi.hint}>
                    {option.active ? 'Provedor atual desta loja.' : 'Credenciais salvas, ainda não ativado.'}
                  </p>
                )}
                {state.status !== 'idle' && (
                  <p className={adminUi.hint} style={state.status === 'error' ? { color: '#b00020' } : undefined}>
                    {state.status === 'testing' ? 'Testando conexão...' : state.message}
                  </p>
                )}

                <div className={`${adminUi.fieldRow} flex-wrap`}>
                  <button type="button" className={adminUi.button} onClick={() => setEditingPaymentProvider(option.provider)}>
                    {option.configured ? 'Editar credenciais' : 'Configurar'}
                  </button>
                  {option.configured && (
                    <button
                      type="button"
                      className={adminUi.button}
                      disabled={state.status === 'testing'}
                      onClick={() => handlePaymentTest(option.provider)}
                    >
                      {state.status === 'testing' ? 'Testando…' : 'Testar conexão'}
                    </button>
                  )}
                  {option.configured && !option.active && (
                    <button
                      type="button"
                      className={adminUi.primaryButton}
                      disabled={state.status !== 'ok' || isPending}
                      onClick={() => handlePaymentActivate(option.provider)}
                    >
                      Ativar
                    </button>
                  )}
                  {option.active && (
                    <button
                      type="button"
                      className={adminUi.dangerButton}
                      disabled={isPending}
                      onClick={() => setPaymentProviderToDeactivate(option)}
                    >
                      Desativar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {paymentOptions.length === 0 && <p className={adminUi.previewEmpty}>Nenhum provedor de pagamento disponível.</p>}
      </main>

      {editing && (
        <ErpProviderCredentialsModal option={editing} onClose={() => setEditingProvider(null)} onSaved={handleSaved} />
      )}
      <ConfirmDialog open={!!providerToDeactivate} onOpenChange={(open) => !open && setProviderToDeactivate(null)} title="Desativar integração?" description={`A sincronização com ${providerToDeactivate?.label || 'o ERP'} ficará pausada até você ativar um provedor novamente.`} confirmLabel="Desativar" destructive onConfirm={() => providerToDeactivate ? handleDeactivate(providerToDeactivate) : undefined} />

      {editingPayment && (
        <PaymentProviderCredentialsModal option={editingPayment} onClose={() => setEditingPaymentProvider(null)} onSaved={handlePaymentSaved} />
      )}
      <ConfirmDialog open={!!paymentProviderToDeactivate} onOpenChange={(open) => !open && setPaymentProviderToDeactivate(null)} title="Desativar gateway de pagamento?" description={`A cobrança via ${paymentProviderToDeactivate?.label || 'o provedor'} ficará indisponível até você ativar um provedor novamente.`} confirmLabel="Desativar" destructive onConfirm={() => paymentProviderToDeactivate ? handlePaymentDeactivate(paymentProviderToDeactivate) : undefined} />
    </div>
  );
}
