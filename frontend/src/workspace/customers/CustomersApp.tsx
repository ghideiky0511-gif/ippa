'use client';
import { useMemo, useState } from 'react';
import { adminUi } from '@/workspace/lib/ui';
import WorkspaceNav from '@/workspace/navigation/WorkspaceNav';
import type { Client } from '@/domain/clients/types';

export default function CustomersApp({ initialClients }: { initialClients: Client[] }) {
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return initialClients;
    return initialClients.filter(
      (c) =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.cpfCnpj || '').toLowerCase().includes(q)
    );
  }, [initialClients, q]);

  return (
    <div>
      <div className={adminUi.topbar}>
        <div className={adminUi.topbarLeft}>
          <h1>Clientes</h1>
          <WorkspaceNav />
        </div>
      </div>

      <main className={adminUi.productsEditor}>
        <div className={adminUi.field} style={{ maxWidth: 360 }}>
          <label>Buscar</label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nome, e-mail ou CPF/CNPJ..."
          />
        </div>

        <table className={adminUi.table}>
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>CPF/CNPJ</th>
              <th>Cidade/UF</th>
            </tr>
          </thead>
          <tbody>
            {results.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.email || '—'}</td>
                <td>{c.cpfCnpj || '—'}</td>
                <td>{c.city ? `${c.city}/${c.state || '—'}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {results.length === 0 && <p className={adminUi.previewEmpty}>Nenhuma cliente encontrada.</p>}
      </main>
    </div>
  );
}
