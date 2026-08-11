'use client';

import { useMemo, useState } from 'react';
import AdminNav from '@/components/AdminNav';

const ROLE_LABELS = { vendedora: 'Vendedora', cliente: 'Cliente' };

// Aba "Usuários" — todo cadastro (vendedora + cliente) numa lista só,
// pensada como o lugar central pra achar quem se cadastrou (ver
// GET /api/admin/users, que já junta users.json com clients.json). Só
// leitura nesta rodada — editar dado de conta pelo admin é um passo
// futuro (mexeria em senha/hash, fora de escopo por ora).
export default function UsersApp({ initialUsers }) {
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    const users = initialUsers || [];
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.cpfCnpj || '').toLowerCase().includes(q)
    );
  }, [initialUsers, q]);

  return (
    <div className="products-page">
      <div className="builder-topbar">
        <div className="builder-topbar-left">
          <h1>Usuários</h1>
          <AdminNav />
        </div>
      </div>

      <main className="products-editor">
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
