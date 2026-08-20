'use client';

import { useState } from 'react';
import { adminUi } from '@/workspace/lib/ui';
import WorkspaceNav from '@/workspace/navigation/WorkspaceNav';
import { addClientByDocument, fetchClientsPage, type ClientsPage } from '@/workspace/lib/customersClient';

function KpiCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <article className="rounded-brand border border-[#eee] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,.05)]">
      <p className="text-sm text-brand-muted">{label}</p>
      <p className="mt-2 text-2xl font-bold text-brand-text">{value.toLocaleString('pt-BR')}</p>
      <p className="mt-1 text-xs text-brand-muted">{hint}</p>
    </article>
  );
}

function AddClientByDocumentModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => Promise<void> }) {
  const [document, setDocument] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    const digits = document.replace(/\D/g, '');
    if (digits.length !== 11 && digits.length !== 14) {
      setError('Informe um CPF com 11 dígitos ou um CNPJ com 14 dígitos.');
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await addClientByDocument(digits);
      if (!result.client) {
        setError('Cliente não encontrada no cadastro local nem no ERP ativo.');
        return;
      }
      await onAdded();
      setMessage(result.source === 'erp'
        ? `${result.client.name} foi importada do ERP e adicionada à base.`
        : `${result.client.name} já consta na sua base de clientes.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível adicionar a cliente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={adminUi.modalOverlay} role="dialog" aria-modal="true" aria-label="Adicionar cliente pelo documento">
      <section className={adminUi.modalPanel}>
        <header className={adminUi.modalHeader}>
          <div>
            <h2 className="font-bold">Adicionar cliente pelo documento</h2>
            <p className="mt-1 text-sm text-brand-muted">Localiza primeiro na sua base e, se necessário, importa do ERP ativo.</p>
          </div>
          <button type="button" className={adminUi.iconButton} onClick={onClose} aria-label="Fechar">×</button>
        </header>
        <div className={`${adminUi.modalBody} flex flex-col gap-4`}>
          <div className={adminUi.field}>
            <label>CPF ou CNPJ</label>
            <input autoFocus value={document} onChange={(event) => setDocument(event.target.value)} onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); void submit(); }
            }} placeholder="000.000.000-00" />
          </div>
          {error && <p className="text-sm text-[#b00020]">{error}</p>}
          {message && <p className="text-sm text-brand-primary">{message}</p>}
        </div>
        <footer className={adminUi.modalFooter}>
          <button type="button" className={adminUi.button} onClick={onClose}>Fechar</button>
          <button type="button" className={adminUi.primaryButton} onClick={() => void submit()} disabled={loading}>{loading ? 'Buscando...' : 'Buscar e adicionar'}</button>
        </footer>
      </section>
    </div>
  );
}

export default function CustomersApp({ initialPage }: { initialPage: ClientsPage }) {
  const [data, setData] = useState(initialPage);
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setAdding] = useState(false);

  async function load(page: number, nextQuery = query) {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchClientsPage({ page, query: nextQuery }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os clientes.');
    } finally {
      setLoading(false);
    }
  }

  async function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = queryInput.trim();
    setQuery(nextQuery);
    await load(1, nextQuery);
  }

  async function refreshAfterAdd() {
    setQuery('');
    setQueryInput('');
    await load(1, '');
  }

  const { clients, pagination, kpis } = data;
  return (
    <div>
      <div className={adminUi.topbar}>
        <div className={adminUi.topbarLeft}>
          <h1>Hub de clientes</h1>
          <WorkspaceNav />
        </div>
        <button type="button" className={adminUi.primaryButton} onClick={() => setAdding(true)}>+ Adicionar pelo documento</button>
      </div>

      <main className={`${adminUi.productsEditor} flex flex-col gap-6`}>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Clientes cadastrados" value={pagination.total} hint={query ? 'resultado da busca' : 'base total'} />
          <KpiCard label="Novos este mês" value={kpis.newThisMonth} hint="no resultado atual" />
          <KpiCard label="Com e-mail" value={kpis.withEmail} hint="cadastro com contato" />
          <KpiCard label="Com cidade e UF" value={kpis.withAddress} hint="cadastro com endereço" />
        </section>

        <section className="rounded-brand border border-[#eee] bg-white p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-bold">Clientes</h2>
              <p className="mt-1 text-sm text-brand-muted">Consulte a base e importe novos cadastros pelo CPF ou CNPJ.</p>
            </div>
            <form className={`${adminUi.field} w-full sm:w-80`} onSubmit={(event) => void submitSearch(event)}>
              <label htmlFor="clients-search">Buscar clientes</label>
              <div className="flex gap-2">
                <input id="clients-search" value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="Nome, e-mail ou CPF/CNPJ..." />
                <button type="submit" className={adminUi.button} disabled={loading}>Buscar</button>
              </div>
            </form>
          </div>

          {error && <p className="mt-3 text-sm text-[#b00020]">{error}</p>}
          <div className="mt-4 overflow-x-auto">
            <table className={adminUi.table}>
              <thead><tr><th>Nome</th><th>E-mail</th><th>CPF/CNPJ</th><th>Cidade/UF</th><th>Cadastro</th></tr></thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id}>
                    <td>{client.name}</td>
                    <td>{client.email || '—'}</td>
                    <td>{client.cpfCnpj || '—'}</td>
                    <td>{client.city ? `${client.city}/${client.state || '—'}` : '—'}</td>
                    <td>{new Date(client.createdAt).toLocaleDateString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {clients.length === 0 && !loading && <p className={`${adminUi.previewEmpty} mt-3`}>Nenhuma cliente encontrada.</p>}
          <div className="mt-4 flex items-center justify-between gap-3 text-sm text-brand-muted">
            <span>{pagination.total} {pagination.total === 1 ? 'cliente' : 'clientes'} · Página {pagination.page} de {pagination.totalPages}</span>
            <div className="flex gap-2">
              <button type="button" className={adminUi.button} disabled={loading || pagination.page <= 1} onClick={() => void load(pagination.page - 1)}>Anterior</button>
              <button type="button" className={adminUi.button} disabled={loading || pagination.page >= pagination.totalPages} onClick={() => void load(pagination.page + 1)}>Próxima</button>
            </div>
          </div>
        </section>
      </main>
      {isAdding && <AddClientByDocumentModal onClose={() => setAdding(false)} onAdded={refreshAfterAdd} />}
    </div>
  );
}
