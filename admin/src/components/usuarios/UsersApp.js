'use client';

import { useMemo, useState } from 'react';
import AdminNav from '@/components/AdminNav';
import { createVendedora } from '@/lib/usersClient';

const ROLE_LABELS = { vendedora: 'Vendedora', cliente: 'Cliente' };

const EMPTY_FORM = { name: '', email: '', password: '' };

// Aba "Usuários" — todo cadastro (vendedora + cliente) numa lista só,
// pensada como o lugar central pra achar quem se cadastrou (ver
// GET /api/admin/users, que já junta users.json com clients.json). A
// listagem de clientes é só leitura (o cadastro delas acontece pelo
// catálogo/talão), mas aqui também dá pra CRIAR um acesso de vendedora —
// é o único jeito de virar vendedora hoje, não existe autocadastro público
// pra esse papel (ver POST /api/admin/users, de propósito).
export default function UsersApp({ initialUsers }) {
  const [users, setUsers] = useState(initialUsers || []);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | error
  const [errorMsg, setErrorMsg] = useState('');

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.cpfCnpj || '').toLowerCase().includes(q)
    );
  }, [users, q]);

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

  return (
    <div className="products-page">
      <div className="builder-topbar">
        <div className="builder-topbar-left">
          <h1>Usuários</h1>
          <AdminNav />
        </div>
      </div>

      <main className="products-editor">
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

        <div className="field" style={{ maxWidth: 360 }}>
          <label>Buscar</label>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nome, e-mail ou CPF/CNPJ..." />
        </div>

        <table className="admin-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Perfil</th>
              <th>CPF/CNPJ</th>
            </tr>
          </thead>
          <tbody>
            {results.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{ROLE_LABELS[u.role] || u.role}</td>
                <td>{u.cpfCnpj || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {results.length === 0 && <p className="preview-empty-text">Nenhum usuário encontrado.</p>}
      </main>
    </div>
  );
}
