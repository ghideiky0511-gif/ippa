// @ts-nocheck
'use client';
import { adminUi } from '@/workspace/lib/ui';
import { useState } from 'react';
import WorkspaceNav from '@/workspace/navigation/WorkspaceNav';
import {
  activateErpIntegration,
  deactivateErpIntegration,
  testErpIntegrationConnection,
} from '@/workspace/lib/erpIntegrationClient';
import ErpProviderCredentialsModal from './ErpProviderCredentialsModal';

// Página central de integrações — só a seção "Sistema ERP" por ora (um
// catálogo de outra categoria, ex. catálogo de pedidos, ganharia sua
// própria seção aqui do mesmo jeito, sem mexer no resto). Salvar
// credenciais e ativar o provider são ações separadas (ver
// erp/erpIntegrationService.ts): "Ativar" só libera depois de um "Testar
// conexão" bem-sucedido nesta sessão — qualquer nova edição de credenciais
// invalida esse teste.
export default function IntegracoesApp({ initialOptions }) {
  const [options, setOptions] = useState(initialOptions || []);
  const [editingProvider, setEditingProvider] = useState(null);
  const [testState, setTestState] = useState({}); // { [provider]: { status, message } }
  const [pendingProvider, setPendingProvider] = useState(null);
  const [feedback, setFeedback] = useState(null); // { type: 'error' | 'success', text }

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
    if (
      !window.confirm(
        `Desativar ${option.label}? A sincronização com o ERP para de funcionar até você ativar um provedor de novo.`
      )
    ) {
      return;
    }
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

  return (
    <div className={adminUi.page}>
      <div className={adminUi.topbar}>
        <div className={adminUi.topbarLeft}>
          <h1>Integrações</h1>
          <WorkspaceNav />
        </div>
      </div>

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
                  {option.active && <span className={adminUi.status}>Ativo</span>}
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

                <div className={adminUi.fieldRow}>
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
                      onClick={() => handleDeactivate(option)}
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

      {editing && (
        <ErpProviderCredentialsModal option={editing} onClose={() => setEditingProvider(null)} onSaved={handleSaved} />
      )}
    </div>
  );
}
