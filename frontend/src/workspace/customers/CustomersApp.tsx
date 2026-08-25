'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import Link from '@/components/TenantLink';
import { adminUi } from '@/workspace/lib/ui';
import { HubHeader } from '@/workspace/components/shared/HubHeader';
import { KpiCard } from '@/workspace/components/shared/KpiCard';
import { ResponsiveDataTable } from '@/workspace/components/shared/ResponsiveDataTable';
import { addClientByDocument, fetchClientsPage, type ClientsPage } from '@/workspace/lib/customersClient';
import { CpfCnpjSchema } from '@/contracts/shared';
import CommercialGroupsPanel from './CommercialGroupsPanel';

const TABS = [
  { id: 'clientes', label: 'Clientes' },
  { id: 'grupos', label: 'Grupos comerciais' },
] as const;
type TabId = typeof TABS[number]['id'];

function AddClientByDocumentModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => Promise<void> }) {
  const [document, setDocument] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    const parsedDocument = CpfCnpjSchema.safeParse(document);
    if (!parsedDocument.success) {
      setError('Informe um CPF com 11 dígitos ou um CNPJ com 14 dígitos.');
      return;
    }
    const digits = parsedDocument.data;
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
          <button type="button" className={adminUi.iconButton} onClick={onClose} aria-label="Fechar"><X className="size-4" aria-hidden="true" /></button>
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
  const [activeTab, setActiveTab] = useState<TabId>('clientes');

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
      <HubHeader
        title="Hub de clientes"
        description="Consulte a base e importe novos cadastros pelo CPF ou CNPJ."
        primaryAction={activeTab === 'clientes' ? { label: 'Adicionar pelo documento', onClick: () => setAdding(true) } : undefined}
      />

      <main className={`${adminUi.productsEditor} flex flex-col gap-6`}>
        <div className="contents">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? adminUi.primaryButton : adminUi.button}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'grupos' ? (
          <CommercialGroupsPanel />
        ) : (
        <>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Clientes cadastrados" value={pagination.total.toLocaleString('pt-BR')} hint={query ? 'resultado da busca' : 'base total'} />
          <KpiCard label="Novos este mês" value={kpis.newThisMonth.toLocaleString('pt-BR')} hint="no resultado atual" />
          <KpiCard label="Com e-mail" value={kpis.withEmail.toLocaleString('pt-BR')} hint="cadastro com contato" />
          <KpiCard label="Com cidade e UF" value={kpis.withAddress.toLocaleString('pt-BR')} hint="cadastro com endereço" />
        </section>

        <section className="rounded-brand border border-border bg-surface p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-bold">Clientes</h2>
              <p className="mt-1 text-sm text-muted-foreground">Consulte a base e importe novos cadastros pelo CPF ou CNPJ.</p>
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
          <ResponsiveDataTable
            rows={clients}
            rowKey={(client) => client.id}
            loading={loading}
            emptyMessage="Nenhuma cliente encontrada."
            columns={[
              { key: 'name', header: 'Nome', cell: (client) => <Link href={`/workspace/clientes/${client.id}`} className="font-semibold text-foreground hover:text-brand-primary">{client.name}</Link> },
              { key: 'email', header: 'E-mail', cell: (client) => client.email || '—' },
              { key: 'doc', header: 'CPF/CNPJ', cell: (client) => client.cpfCnpj || '—' },
              { key: 'city', header: 'Cidade/UF', cell: (client) => client.city ? `${client.city}/${client.state || '—'}` : '—' },
              { key: 'createdAt', header: 'Cadastro', cell: (client) => new Date(client.createdAt).toLocaleDateString('pt-BR') },
            ]}
            mobileCard={(client) => (
              <Link href={`/workspace/clientes/${client.id}`} className="block rounded-brand border border-border bg-surface p-4 active:scale-[.99]">
                <p className="font-semibold text-foreground">{client.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{client.email || 'Sem e-mail'} · {client.cpfCnpj || 'Sem documento'}</p>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{client.city ? `${client.city}/${client.state || '—'}` : 'Sem endereço'}</span>
                  <span>Desde {new Date(client.createdAt).toLocaleDateString('pt-BR')}</span>
                </div>
              </Link>
            )}
          />
          <div className="mt-4 flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>{pagination.total} {pagination.total === 1 ? 'cliente' : 'clientes'} · Página {pagination.page} de {pagination.totalPages}</span>
            <div className="flex gap-2">
              <button type="button" className={adminUi.button} disabled={loading || pagination.page <= 1} onClick={() => void load(pagination.page - 1)}>Anterior</button>
              <button type="button" className={adminUi.button} disabled={loading || pagination.page >= pagination.totalPages} onClick={() => void load(pagination.page + 1)}>Próxima</button>
            </div>
          </div>
        </section>
        </>
        )}
      </main>
      {isAdding && <AddClientByDocumentModal onClose={() => setAdding(false)} onAdded={refreshAfterAdd} />}
    </div>
  );
}
