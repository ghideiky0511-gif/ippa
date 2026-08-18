// @ts-nocheck
'use client';

import { Fragment, useMemo, useState } from 'react';
import AdminNav from '@/admin/components/AdminNav';
import { fetchUsers, deleteUser } from '@/admin/lib/usersClient';
import UserFormModal from './UserFormModal';

const TABS = [
  { id: 'vendedoras', label: 'Vendedoras' },
  { id: 'clientes', label: 'Clientes' },
];

const AREA_LABELS = {
  talao: 'Talão de pedidos',
  pedidos: 'Meus pedidos / Minhas vendas',
};

const CLIENT_DETAILS = [
  ['cpfCnpj', 'CPF/CNPJ'],
  ['clientEmail', 'E-mail de contato'],
  ['companyResponsible', 'Responsável (CNPJ)'],
  ['storeName', 'Nome da loja (CPF)'],
  ['cep', 'CEP'],
  ['street', 'Rua'],
  ['number', 'Número'],
  ['complement', 'Complemento'],
  ['neighborhood', 'Bairro'],
  ['city', 'Cidade'],
  ['state', 'Estado'],
  ['createdAt', 'Cadastrada em'],
  ['password', 'Senha'],
];

const VENDEDORA_DETAILS = [
  ['id', 'ID da conta'],
  ['adminAccess', 'Acesso à plataforma admin'],
  ['catalogAreas', 'Ferramentas liberadas no catálogo'],
  ['password', 'Senha'],
];

function detailsFor(activeTab) {
  return activeTab === 'clientes' ? CLIENT_DETAILS : VENDEDORA_DETAILS;
}

function valueFor(u, key) {
  if (key === 'adminAccess') return u.permissions?.adminAccess ? 'Sim' : 'Não';
  if (key === 'catalogAreas') {
    const areas = u.permissions?.catalogAreas || [];
    return areas.length ? areas.map((a) => AREA_LABELS[a] || a).join(', ') : null;
  }
  // Senha só existe como hash (bcrypt) — nunca trafega pro admin, nem
  // existe em texto puro em lugar nenhum. Mostrar aqui é só indicar que
  // tem uma senha definida; pra trocar é só usar o lápis de editar.
  if (key === 'password') return '••••••••';
  return u[key];
}

function formatValue(key, value) {
  if (!value) return '—';
  if (key === 'createdAt') return new Date(value).toLocaleDateString('pt-BR');
  return value;
}

// Aba "Usuários" — dividida em duas sub-abas (vendedora × cliente) porque o
// dado e a ação de cada uma são bem diferentes (ver histórico deste
// arquivo). O campo de busca filtra só os já cadastrados; criar um acesso
// novo abre o painel lateral (UserFormModal), com os campos de cada perfil
// — vendedora só login, cliente login + cadastro completo. Cada linha tem
// "Ver mais" (expande o cadastro inteiro) e um lápis (abre o mesmo painel
// em modo edição).
export default function UsersApp({ initialUsers }) {
  const [users, setUsers] = useState(initialUsers || []);
  const [activeTab, setActiveTab] = useState('vendedoras');
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [modal, setModal] = useState(null); // { mode: 'create'|'edit', user? }
  const [deletingId, setDeletingId] = useState(null);

  const byTab = useMemo(
    () => ({
      vendedoras: users.filter((u) => u.role === 'vendedora'),
      clientes: users.filter((u) => u.role === 'cliente'),
    }),
    [users]
  );

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    const list = byTab[activeTab];
    if (!q) return list;
    return list.filter(
      (u) =>
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.cpfCnpj || '').toLowerCase().includes(q)
    );
  }, [byTab, activeTab, q]);

  async function refresh() {
    try {
      setUsers(await fetchUsers());
    } catch {
      // mantém a lista atual (só otimista) se o refresh falhar
    }
  }

  async function handleDelete(u) {
    const label = u.role === 'cliente' ? 'esta cliente (login + cadastro)' : 'esta vendedora';
    if (!window.confirm(`Excluir ${label} — ${u.name} (${u.email})? Não dá pra desfazer.`)) return;
    setDeletingId(u.id);
    try {
      await deleteUser(u.id);
      setUsers((prev) => prev.filter((existing) => existing.id !== u.id));
    } catch (err) {
      window.alert(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  function handleSaved() {
    setModal(null);
    refresh();
  }

  return (
    <div className="products-page">
      <div className="builder-topbar">
        <div className="builder-topbar-left">
          <h1>Usuários</h1>
          <AdminNav />
        </div>
      </div>

      <main className="products-editor">
        <div className="usuarios-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={'btn' + (activeTab === tab.id ? ' btn-primary' : '')}
              onClick={() => {
                setActiveTab(tab.id);
                setQuery('');
                setExpandedId(null);
              }}
            >
              {tab.label} ({byTab[tab.id].length})
            </button>
          ))}
        </div>

        <div className="usuarios-toolbar">
          <div className="field" style={{ maxWidth: 360 }}>
            <label>Buscar</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={activeTab === 'clientes' ? 'Nome, e-mail ou CPF/CNPJ...' : 'Nome ou e-mail...'}
            />
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>
            + Criar {activeTab === 'clientes' ? 'cliente' : 'vendedora'}
          </button>
        </div>

        <table className="admin-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              {activeTab === 'clientes' && <th>CPF/CNPJ</th>}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {results.map((u) => (
              <Fragment key={u.id}>
                <tr>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  {activeTab === 'clientes' && <td>{u.cpfCnpj || '—'}</td>}
                  <td>
                    <div className="user-row-actions">
                      <button
                        type="button"
                        className="btn btn-icon"
                        onClick={() => setExpandedId(expandedId === u.id ? null : u.id)}
                      >
                        {expandedId === u.id ? 'Ver menos' : 'Ver mais'}
                      </button>
                      <button type="button" className="btn btn-icon" title="Editar" onClick={() => setModal({ mode: 'edit', user: u })}>
                        ✎
                      </button>
                      <button
                        type="button"
                        className="btn btn-icon btn-danger"
                        title="Excluir usuário"
                        disabled={deletingId === u.id}
                        onClick={() => handleDelete(u)}
                      >
                        &times;
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedId === u.id && (
                  <tr className="user-detail-row">
                    <td colSpan={activeTab === 'clientes' ? 4 : 3}>
                      <dl className="user-detail-grid">
                        {detailsFor(activeTab).map(([key, label]) => (
                          <div className="user-detail-item" key={key}>
                            <dt>{label}</dt>
                            <dd>{formatValue(key, valueFor(u, key))}</dd>
                          </div>
                        ))}
                      </dl>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {results.length === 0 && <p className="preview-empty-text">Nenhum usuário encontrado.</p>}
      </main>

      {modal && (
        <UserFormModal
          role={activeTab}
          mode={modal.mode}
          user={modal.user}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
