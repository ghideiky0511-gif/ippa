// @ts-nocheck
'use client';
import { adminUi } from '@/workspace/lib/ui';
import { Fragment, useMemo, useState } from 'react';
import { HubHeader } from '@/workspace/components/shared/HubHeader';
import { fetchUsers, deleteUser } from '@/workspace/lib/usersClient';
import UserFormModal from './UserFormModal';
import SellerWalletPanel from './SellerWalletPanel';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Trash2 } from 'lucide-react';

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
  ['whatsappPhone', 'Telefone WhatsApp Business'],
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
  const [userToDelete, setUserToDelete] = useState(null);

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
      <HubHeader
        title="Usuários"
        primaryAction={{ label: `Criar ${activeTab === 'clientes' ? 'cliente' : 'vendedora'}`, onClick: () => setModal({ mode: 'create' }) }}
      />

      <main className={adminUi.productsEditor}>
        <div className="contents">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? adminUi.primaryButton : adminUi.button}
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

        <div className="contents">
          <div className={adminUi.field} style={{ maxWidth: 360 }}>
            <label>Buscar</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={activeTab === 'clientes' ? 'Nome, e-mail ou CPF/CNPJ...' : 'Nome ou e-mail...'}
            />
          </div>
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className={adminUi.table}>
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
                      <div className="contents">
                        <button
                          type="button"
                          className={adminUi.iconButton}
                          onClick={() => setExpandedId(expandedId === u.id ? null : u.id)}
                        >
                          {expandedId === u.id ? 'Ver menos' : 'Ver mais'}
                        </button>
                        <button type="button" className={adminUi.iconButton} title="Editar" onClick={() => setModal({ mode: 'edit', user: u })}>
                          ✎
                        </button>
                        <button
                          type="button"
                          className={adminUi.iconButton}
                          title="Excluir usuário"
                          disabled={deletingId === u.id}
                          onClick={() => setUserToDelete(u)}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === u.id && (
                    <tr className="contents">
                      <td colSpan={activeTab === 'clientes' ? 4 : 3}>
                        <dl className="contents">
                          {detailsFor(activeTab).map(([key, label]) => (
                            <div className="contents" key={key}>
                              <dt>{label}</dt>
                              <dd>{formatValue(key, valueFor(u, key))}</dd>
                            </div>
                          ))}
                        </dl>
                        {activeTab === 'vendedoras' && (
                          <div className="mt-3">
                            <h4 className="text-xs font-semibold text-brand-muted">Carteira de clientes</h4>
                            <SellerWalletPanel seller={u} vendedoras={byTab.vendedoras} />
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 md:hidden">
          {results.map((u) => {
            const isExpanded = expandedId === u.id;
            return (
              <div key={u.id} className="rounded-brand border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{u.name}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{u.email}{activeTab === 'clientes' ? ` · ${u.cpfCnpj || 'sem documento'}` : ''}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" className={adminUi.iconButton} title="Editar" onClick={() => setModal({ mode: 'edit', user: u })}>✎</button>
                    <button type="button" className={adminUi.iconButton} title="Excluir usuário" disabled={deletingId === u.id} onClick={() => setUserToDelete(u)}><Trash2 className="size-4" aria-hidden="true" /></button>
                  </div>
                </div>
                <button type="button" className={`${adminUi.button} mt-3`} onClick={() => setExpandedId(isExpanded ? null : u.id)}>{isExpanded ? 'Ver menos' : 'Ver mais'}</button>
                {isExpanded && (
                  <dl className="mt-3 flex flex-col gap-1 border-t border-border pt-3 text-sm">
                    {detailsFor(activeTab).map(([key, label]) => (
                      <div className="flex items-baseline justify-between gap-3" key={key}>
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="text-right">{formatValue(key, valueFor(u, key))}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {isExpanded && activeTab === 'vendedoras' && (
                  <div className="mt-3 border-t border-border pt-3">
                    <h4 className="text-xs font-semibold text-brand-muted">Carteira de clientes</h4>
                    <SellerWalletPanel seller={u} vendedoras={byTab.vendedoras} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {results.length === 0 && <p className={adminUi.previewEmpty}>Nenhum usuário encontrado.</p>}
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
      <ConfirmDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)} title="Excluir usuário?" description={`Excluir ${userToDelete?.role === 'cliente' ? 'esta cliente e seu cadastro' : 'esta vendedora'} — ${userToDelete?.name || ''} (${userToDelete?.email || ''})? Esta ação não pode ser desfeita.`} confirmLabel="Excluir" destructive onConfirm={() => userToDelete ? handleDelete(userToDelete) : undefined} />
    </div>
  );
}
