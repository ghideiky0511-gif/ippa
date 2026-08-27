// @ts-nocheck
'use client';
import { adminUi } from '@/workspace/lib/ui';
import { useState } from 'react';
import { X } from 'lucide-react';
import { savePaymentIntegrationCredentials } from '@/workspace/lib/paymentIntegrationClient';

// Formulário genérico: os campos vêm de option.credentialFields (catálogo do
// backend, ver payments/providerCatalog.ts) -- mesmo padrão de
// ErpProviderCredentialsModal.tsx, mas sem os agrupamentos "publishing"/
// "orders" (específicos do domínio de ERP) -- credencial de pagamento é
// sempre só "conexão". Campo nunca vem pré-preenchido: diferente do ERP, o
// backend não devolve NENHUM valor salvo (nem os não-secretos) para
// credencial de pagamento (ver paymentIntegrationService.ts) -- editar
// sempre exige redigitar tudo.
export default function PaymentProviderCredentialsModal({ option, onClose, onSaved }) {
  const [form, setForm] = useState(() => {
    const initial = {};
    for (const field of option.credentialFields) initial[field.key] = '';
    return initial;
  });
  const [saveState, setSaveState] = useState('idle'); // idle | saving | error
  const [errorMsg, setErrorMsg] = useState('');

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
            placeholder={option.configured ? 'Preencha para alterar' : ''}
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
      const saved = await savePaymentIntegrationCredentials(option.provider, form);
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
              As credenciais precisam ser reinformadas por completo a cada alteração -- nunca ficam salvas aqui
              depois de digitadas.
            </p>
            {option.credentialFields.map(renderField)}
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
