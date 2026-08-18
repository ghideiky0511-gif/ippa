// @ts-nocheck
'use client';

import { useState } from 'react';
import { createVendedora, createCliente, updateUser, updateClient } from '@/admin/lib/usersClient';

// Ferramentas do catálogo que dá pra liberar/bloquear por conta (ver
// KNOWN_CATALOG_AREAS em web/src/lib/auth.ts e areaForPath em
// web/src/proxy.ts, fonte de verdade de quais rotas cada chave cobre).
const CATALOG_AREAS = [
  { key: 'talao', label: 'Talão de pedidos (catálogo, carrinho e frete)' },
  { key: 'pedidos', label: 'Meus pedidos / Minhas vendas' },
];

const DEFAULT_VENDEDORA_AREAS = ['talao', 'pedidos'];

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
    if (!form.name.trim() || !form.email.trim()) {
      setSaveState('error');
      setErrorMsg('Preencha nome e e-mail de login.');
      return;
    }
    if (!isEdit && !form.password) {
      setSaveState('error');
      setErrorMsg('Preencha a senha de acesso.');
      return;
    }
    if (form.password && form.password.length < 6) {
      setSaveState('error');
      setErrorMsg('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }

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
        saved = { ...loginUpdate, ...clientUpdate, id: loginUpdate.id, clientId: user.clientId };
      }
      onSaved(saved);
    } catch (err) {
      setSaveState('error');
      setErrorMsg(err.message);
    }
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-header">
          <h2>
            {isEdit ? 'Editar' : 'Criar'} {isCliente ? 'cliente' : 'vendedora'}
          </h2>
          <button type="button" className="admin-modal-close" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
          <div className="admin-modal-body">
            <div className="admin-modal-section">
              <h3>Acesso (login)</h3>
              <div className="field-row">
                <div className="field">
                  <label>Nome</label>
                  <input value={form.name} onChange={set('name')} placeholder="Nome" />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label>E-mail de login</label>
                  <input type="email" value={form.email} onChange={set('email')} placeholder="email@loja.com" />
                </div>
              </div>
              <div className="field-row">
                {isEdit && (
                  <div className="field">
                    <label>Senha atual</label>
                    {/* Senha só existe como hash (bcrypt, sem volta) — não
                        dá pra mostrar a senha de verdade aqui, só indicar
                        que existe uma definida. Trocar é só preencher o
                        campo ao lado. */}
                    <input type="password" value="••••••••" disabled readOnly />
                  </div>
                )}
                <div className="field">
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
              <div className="admin-modal-section">
                <h3>Ferramentas liberadas no catálogo</h3>
                {CATALOG_AREAS.map((area) => (
                  <label key={area.key} className="admin-checkbox-row">
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
              <div className="admin-modal-section">
                <h3>Cadastro</h3>
                <div className="field-row">
                  <div className="field">
                    <label>CPF/CNPJ</label>
                    <input value={form.cpfCnpj} onChange={set('cpfCnpj')} placeholder="Somente números" />
                  </div>
                  <div className="field">
                    <label>E-mail de contato</label>
                    <input type="email" value={form.clientEmail} onChange={set('clientEmail')} placeholder="Opcional, se diferente do login" />
                  </div>
                </div>
                <div className="field-row">
                  <div className="field">
                    <label>Responsável (CNPJ)</label>
                    <input value={form.companyResponsible} onChange={set('companyResponsible')} />
                  </div>
                  <div className="field">
                    <label>Nome da loja (CPF)</label>
                    <input value={form.storeName} onChange={set('storeName')} />
                  </div>
                </div>
                <div className="field-row">
                  <div className="field">
                    <label>CEP</label>
                    <input value={form.cep} onChange={set('cep')} />
                  </div>
                  <div className="field">
                    <label>Rua</label>
                    <input value={form.street} onChange={set('street')} />
                  </div>
                  <div className="field">
                    <label>Número</label>
                    <input value={form.number} onChange={set('number')} />
                  </div>
                </div>
                <div className="field-row">
                  <div className="field">
                    <label>Complemento</label>
                    <input value={form.complement} onChange={set('complement')} />
                  </div>
                  <div className="field">
                    <label>Bairro</label>
                    <input value={form.neighborhood} onChange={set('neighborhood')} />
                  </div>
                </div>
                <div className="field-row">
                  <div className="field">
                    <label>Cidade</label>
                    <input value={form.city} onChange={set('city')} />
                  </div>
                  <div className="field">
                    <label>Estado</label>
                    <input value={form.state} onChange={set('state')} />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="admin-modal-footer">
            {saveState === 'error' && <span className="admin-login-error">{errorMsg}</span>}
            <button type="button" className="btn" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saveState === 'saving'}>
              {saveState === 'saving' ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
