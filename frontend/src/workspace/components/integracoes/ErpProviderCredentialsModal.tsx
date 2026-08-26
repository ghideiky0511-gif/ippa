// @ts-nocheck
'use client';
import { adminUi } from '@/workspace/lib/ui';
import { useState } from 'react';
import { X } from 'lucide-react';
import { saveErpIntegrationCredentials } from '@/workspace/lib/erpIntegrationClient';

// Formulário genérico: os campos vêm de option.credentialFields (catálogo
// do backend, ver erp/providerCatalog.ts) — nada aqui é específico de
// TOTVS Moda, um provider novo só precisa aparecer no catálogo do backend.
// Campos "password" nunca vêm pré-preenchidos (o backend nunca devolve
// segredo salvo) — editar credenciais existentes sempre exige redigitar
// client secret/senha por completo.
export default function ErpProviderCredentialsModal({ option, onClose, onSaved }) {
  const [form, setForm] = useState(() => {
    const initial = {};
    for (const field of option.credentialFields) {
      const value = option.credentials?.[field.key];
      if (field.type === 'number-list' && Array.isArray(value)) {
        initial[field.key] = value.join(', ');
      } else {
        initial[field.key] = value != null ? String(value) : '';
      }
    }
    return initial;
  });
  const [saveState, setSaveState] = useState('idle'); // idle | saving | error
  const [errorMsg, setErrorMsg] = useState('');

  const connectionFields = option.credentialFields.filter((f) => (f.group || 'connection') === 'connection');
  const publishingFields = option.credentialFields.filter((f) => f.group === 'publishing');
  const orderFields = option.credentialFields.filter((f) => f.group === 'orders');
  const orderFieldsFilled = orderFields.some((f) => (form[f.key] || '').trim() !== '');
  const [ordersExpanded, setOrdersExpanded] = useState(orderFieldsFilled);

  function set(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  function renderField(field) {
    return (
      <div className={adminUi.fieldRow} key={field.key}>
        <div className={adminUi.field}>
          <label>
            {field.label}
            {field.required ? ' *' : ''}
          </label>
          <input
            type={field.type === 'password' ? 'password' : 'text'}
            value={form[field.key] || ''}
            onChange={set(field.key)}
            autoComplete="off"
            placeholder={field.type === 'password' && option.configured ? 'Preencha para alterar' : ''}
          />
        </div>
      </div>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaveState('saving');
    setErrorMsg('');
    try {
      const saved = await saveErpIntegrationCredentials(option.provider, form);
      onSaved(saved);
    } catch (err) {
      setSaveState('error');
      setErrorMsg(err.message);
    }
  }

  return (
    <div className={adminUi.modalOverlay} onClick={onClose}>
      <div className={adminUi.modalPanel} onClick={(e) => e.stopPropagation()}>
        <div className={adminUi.modalHeader}>
          <h2>{option.label}</h2>
          <button type="button" className={adminUi.iconButton} onClick={onClose} aria-label="Fechar">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
          <div className={adminUi.modalBody}>
            <p className={adminUi.hint}>
              Client secret e senha precisam ser reinformados por completo a cada alteração — nunca ficam
              salvos aqui depois de digitados.
            </p>
            {connectionFields.length > 0 && (
              <>
                <h3 className={adminUi.subheading}>Conexão</h3>
                {connectionFields.map(renderField)}
              </>
            )}

            {publishingFields.length > 0 && (
              <>
                <h3 className={adminUi.subheading}>Publicação de produtos</h3>
                <p className={adminUi.hint}>
                  Só produtos com esta classificação são publicados na loja; preencher os dois campos abaixo liga a
                  sincronização automática de catálogo.
                </p>
                {publishingFields.map(renderField)}
              </>
            )}

            {orderFields.length > 0 && (
              <div className={adminUi.similarField}>
                <button type="button" className={adminUi.similarToggle} onClick={() => setOrdersExpanded((v) => !v)}>
                  Envio de pedidos (opcional) {ordersExpanded ? '▾' : '▸'}
                </button>
                {ordersExpanded && (
                  <div className={adminUi.similarBody}>
                    <p className={adminUi.hint}>
                      Só necessário se esta loja envia pedidos de venda para o TOTVS.
                    </p>
                    {orderFields.map(renderField)}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className={adminUi.modalFooter}>
            {saveState === 'error' && <span className="contents">{errorMsg}</span>}
            <button type="button" className={adminUi.button} onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className={adminUi.primaryButton} disabled={saveState === 'saving'}>
              {saveState === 'saving' ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
