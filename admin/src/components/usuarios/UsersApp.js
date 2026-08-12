'use client';

import { useMemo, useState } from 'react';
import AdminNav from '@/components/AdminNav';
import { createVendedora, deleteUser } from '@/lib/usersClient';

const EMPTY_FORM = { name: '', email: '', password: '' };

const TABS = [
  { id: 'vendedoras', label: 'Vendedoras' },
  { id: 'clientes', label: 'Clientes' },
];

// Aba "Usuários" — dividida em duas sub-abas (vendedora × cliente) porque o
// dado e a ação de cada uma são bem diferentes: vendedora só existe pelo
// que se cria aqui (POST /api/admin/users, de propósito — não existe
// autocadastro público pra esse papel) e não tem CPF/CNPJ nem cadastro
// associado; cliente vem sempre de fora (autocadastro em /cadastro ou
// cadastro rápido da vendedora no talão) e carrega o Client inteiro
// (CPF/CNPJ, última vendedora que atendeu). Antes as duas viviam numa
// tabela só com uma coluna "Perfil" pra distinguir — combinado com o
// usuário: separar de vez, cada sub-aba já sabe o que é sem precisar de
// coluna extra. GET /api/admin/users continua trazendo as duas juntas (list
// combinada), a divisão é só de exibição aqui.
export default function UsersApp({ initialUsers }) {
  const [users, setUsers] = useState(initialUsers || []);
  const [activeTab, setActiveTab] = useState('vendedoras');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | error
  const [errorMsg, setErrorMsg] = useState('');
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

  async function handleCreateVendedora(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      setSaveState('error');
      setErrorMsg('Preencha nome, e-mail e senha.');
      return;
    }
    if (form.password.length < 6) {
      setSaveState('error');
      setErrorMsg('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    setSaveState('saving');
    setErrorMsg('');
    try {
      const newUser = await createVendedora(form);
      setUsers((prev) => [newUser, ...prev]);
      setForm(EMPTY_FORM);
      setSaveState('idle');
    } catch (err) {
      setSaveState('error');
      setErrorMsg(err.message);
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
              }}
            >
              {tab.label} ({byTab[tab.id].length})
            </button>
          ))}
        </div>

        {activeTab === 'vendedoras' && (
          <form onSubmit={handleCreateVendedora}>
            <h2>Novo acesso de vendedora</h2>
            <div className="field-row" style={{ alignItems: 'flex-end' }}>
              <div className="field" style={{ maxWidth: 220 }}>
                <label>Nome</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Nome da vendedora"
                />
              </div>
              <div className="field" style={{ maxWidth: 260 }}>
                <label>E-mail</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="email@loja.com"
                />
              </div>
              <div className="field" style={{ maxWidth: 200 }}>
                <label>Senha</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
              <button className="btn btn-primary" type="submit" disabled={saveState === 'saving'}>
                {saveState === 'saving' ? 'Criando…' : 'Criar acesso'}
              </button>
              {saveState === 'error' && <span className="status">{errorMsg}</span>}
            </div>
          </form>
        )}

        {activeTab === 'clientes' && (
          <p className="preview-empty-text">
            Cadastro de cliente vem sempre de fora (autocadastro no catálogo ou cadastro rápido da vendedora no
            talão) — aqui só dá pra consultar e excluir.
          </p>
        )}

        <div className="field" style={{ maxWidth: 360 }}>
          <label>Buscar</label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={activeTab === 'clientes' ? 'Nome, e-mail ou CPF/CNPJ...' : 'Nome ou e-mail...'}
          />
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
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                {activeTab === 'clientes' && <td>{u.cpfCnpj || '—'}</td>}
                <td>
                  <button
                    type="button"
                    className="btn btn-icon btn-danger"
                    title="Excluir usuário"
                    disabled={deletingId === u.id}
                    onClick={() => handleDelete(u)}
                  >
                    &times;
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {results.length === 0 && <p className="preview-empty-text">Nenhum usuário encontrado.</p>}
      </main>
    </div>
  );
}
