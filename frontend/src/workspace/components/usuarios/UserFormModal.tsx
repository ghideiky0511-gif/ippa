// @ts-nocheck
'use client';
import { adminUi } from '@/workspace/lib/ui';
import { useState } from 'react';
import { LockKeyhole, X } from 'lucide-react';
import { createVendedora, createCliente, updateUser, updateClient } from '@/workspace/lib/usersClient';
import { DEFAULT_SELLER_CATALOG_AREAS } from '@/domain/clients/types';

// Ferramentas do catálogo que dá pra liberar/bloquear por conta (ver
// KNOWN_CATALOG_AREAS em web/src/lib/auth.ts e areaForPath em
// web/src/proxy.ts, fonte de verdade de quais rotas cada chave cobre).
const CATALOG_AREAS = [
  { key: 'talao', label: 'Talão de pedidos (catálogo, carrinho e frete)' },
  { key: 'pedidos', label: 'Meus pedidos / Minhas vendas' },
];

const DEFAULT_VENDEDORA_AREAS = [...DEFAULT_SELLER_CATALOG_AREAS];

const EMPTY = {
  name: '',
  email: '',
  password: '',
  cpfCnpj: '',
  clientEmail: '',
  cep: '',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
  companyResponsible: '',
  storeName: '',
};

// Painel de criar/editar acesso — os campos mostrados dependem da sub-aba
// (role: 'vendedoras' | 'clientes'), respeitando o cadastro de cada uma
// (vendedora: só login; cliente: login + cadastro completo). Reaproveitado
// tanto pro botão "+ Criar acesso" (mode 'create') quanto pelo lápis de
// editar em cada linha (mode 'edit', pré-preenchido).
export default function UserFormModal({ role, mode, user, onClose, onSaved }) {
  const isCliente = role === 'clientes';
  const isEdit = mode === 'edit';
  const [form, setForm] = useState(() => ({
    ...EMPTY,
    name: user?.name || '',
    email: user?.email || '',
    cpfCnpj: user?.cpfCnpj || '',
    clientEmail: user?.clientEmail || '',
    cep: user?.cep || '',
    street: user?.street || '',
    number: user?.number || '',
    complement: user?.complement || '',
    neighborhood: user?.neighborhood || '',
    city: user?.city || '',
    state: user?.state || '',
    companyResponsible: user?.companyResponsible || '',
    storeName: user?.storeName || '',
  }));
  const [catalogAreas, setCatalogAreas] = useState(
    () => user?.permissions?.catalogAreas ?? (isEdit ? [] : DEFAULT_VENDEDORA_AREAS)
  );
  const [saveState, setSaveState] = useState('idle'); // idle | saving | error
  const [errorMsg, setErrorMsg] = useState('');

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function toggleArea(key) {
    setCatalogAreas((areas) => (areas.includes(key) ? areas.filter((a) => a !== key) : [...areas, key]));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaveState('saving');
    setErrorMsg('');
    try {
      let saved;
      if (!isEdit && !isCliente) {
        saved = await createVendedora({ name: form.name, email: form.email, password: form.password, catalogAreas });
      } else if (!isEdit && isCliente) {
        saved = await createCliente(form);
      } else if (isEdit && !isCliente) {
        saved = await updateUser(user.id, { name: form.name, email: form.email, password: form.password, catalogAreas });
      } else {
        // Edita login e cadastro juntos — dois registros diferentes por
        // trás (ver comentário em Client, web/src/lib/types.ts).
        const loginUpdate = await updateUser(user.id, { name: form.name, email: form.email, password: form.password });
        let clientUpdate = {};
        if (user.clientId) {
          clientUpdate = await updateClient(user.clientId, form);
        }
        saved = {
          ...loginUpdate,
          ...(clientUpdate ? {
            cpfCnpj: clientUpdate.cpfCnpj,
            clientEmail: clientUpdate.email,
            cep: clientUpdate.cep,
            street: clientUpdate.street,
            number: clientUpdate.number,
            complement: clientUpdate.complement,
            neighborhood: clientUpdate.neighborhood,
            city: clientUpdate.city,
            state: clientUpdate.state,
            companyResponsible: clientUpdate.companyResponsible,
            storeName: clientUpdate.storeName,
          } : {}),
          clientId: user.clientId,
        };
      }
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
          <h2>
            {isEdit ? 'Editar' : 'Criar'} {isCliente ? 'cliente' : 'vendedora'}
          </h2>
          <button type="button" className={adminUi.iconButton} onClick={onClose} aria-label="Fechar"><X className="size-4" aria-hidden="true" /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
          <div className={adminUi.modalBody}>
            <div className="contents">
              <h3>Acesso (login)</h3>
              <div className={adminUi.fieldRow}>
                <div className={adminUi.field}>
                  <label>Nome</label>
                  <input value={form.name} onChange={set('name')} placeholder="Nome" />
                </div>
              </div>
              <div className={adminUi.fieldRow}>
                <div className={adminUi.field}>
                  <label>E-mail de login</label>
                  <input type="email" value={form.email} onChange={set('email')} placeholder="email@loja.com" />
                </div>
              </div>
              <div className={adminUi.fieldRow}>
                {isEdit && (
                  <div className={adminUi.field}>
                    <label>Senha atual</label>
                    {/* Senha só existe como hash (bcrypt, sem volta) — não
                        dá pra mostrar a senha de verdade aqui, só indicar
                        que existe uma definida. Trocar é só preencher o
                        campo ao lado. */}
                    <input type="password" value="••••••••" disabled readOnly />
                  </div>
                )}
                <div className={adminUi.field}>
                  <label>{isEdit ? 'Nova senha (opcional)' : 'Senha'}</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={set('password')}
                    placeholder={isEdit ? 'Deixe em branco pra manter' : 'Mínimo 6 caracteres'}
                  />
                </div>
              </div>
            </div>

            {!isCliente && (
              <div className="contents">
                <h3>Ferramentas liberadas no catálogo</h3>
                {CATALOG_AREAS.map((area) => (
                  <label key={area.key} className="contents">
                    <input
                      type="checkbox"
                      checked={catalogAreas.includes(area.key)}
                      onChange={() => toggleArea(area.key)}
                    />
                    {area.label}
                  </label>
                ))}
              </div>
            )}

            {isCliente && (
              <div className="contents">
                <h3>Cadastro</h3>
                {isEdit ? (
                  <>
                    <div className={adminUi.fieldRow}>
                      <div className={adminUi.field}>
                        <label>CPF/CNPJ</label>
                        <input value={form.cpfCnpj} disabled readOnly />
                      </div>
                      <div className={adminUi.field}>
                        <label>E-mail de contato</label>
                        <input type="email" value={form.clientEmail} disabled readOnly />
                      </div>
                    </div>
                    <p className="text-xs text-brand-muted">
                      <LockKeyhole className="mr-1 inline size-3" aria-hidden="true" />
                      CPF/CNPJ e e-mail não são editáveis aqui — use &quot;Sincronizar com ERP&quot; ou peça para a cliente confirmar no próprio login (ver /workspace/clientes).
                    </p>
                  </>
                ) : (
                  <div className={adminUi.fieldRow}>
                    <div className={adminUi.field}>
                      <label>CPF/CNPJ</label>
                      <input value={form.cpfCnpj} onChange={set('cpfCnpj')} placeholder="Somente números" />
                    </div>
                    <div className={adminUi.field}>
                      <label>E-mail de contato</label>
                      <input type="email" value={form.clientEmail} onChange={set('clientEmail')} placeholder="Opcional, se diferente do login" />
                    </div>
                  </div>
                )}
                <div className={adminUi.fieldRow}>
                  <div className={adminUi.field}>
                    <label>Responsável (CNPJ)</label>
                    <input value={form.companyResponsible} onChange={set('companyResponsible')} />
                  </div>
                  <div className={adminUi.field}>
                    <label>Nome da loja (CPF)</label>
                    <input value={form.storeName} onChange={set('storeName')} />
                  </div>
                </div>
                <div className={adminUi.fieldRow}>
                  <div className={adminUi.field}>
                    <label>CEP</label>
                    <input value={form.cep} onChange={set('cep')} />
                  </div>
                  <div className={adminUi.field}>
                    <label>Rua</label>
                    <input value={form.street} onChange={set('street')} />
                  </div>
                  <div className={adminUi.field}>
                    <label>Número</label>
                    <input value={form.number} onChange={set('number')} />
                  </div>
                </div>
                <div className={adminUi.fieldRow}>
                  <div className={adminUi.field}>
                    <label>Complemento</label>
                    <input value={form.complement} onChange={set('complement')} />
                  </div>
                  <div className={adminUi.field}>
                    <label>Bairro</label>
                    <input value={form.neighborhood} onChange={set('neighborhood')} />
                  </div>
                </div>
                <div className={adminUi.fieldRow}>
                  <div className={adminUi.field}>
                    <label>Cidade</label>
                    <input value={form.city} onChange={set('city')} />
                  </div>
                  <div className={adminUi.field}>
                    <label>Estado</label>
                    <input value={form.state} onChange={set('state')} />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className={adminUi.modalFooter}>
            {saveState === 'error' && <span className="contents">{errorMsg}</span>}
            <button type="button" className={adminUi.button} onClick={onClose}>Cancelar</button>
            <button type="submit" className={adminUi.primaryButton} disabled={saveState === 'saving'}>
              {saveState === 'saving' ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
