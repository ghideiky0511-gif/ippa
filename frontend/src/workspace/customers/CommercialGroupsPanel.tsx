'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { adminUi } from '@/workspace/lib/ui';
import { ResponsiveDataTable } from '@/workspace/components/shared/ResponsiveDataTable';
import { searchOrderClients } from '@/lib/ordersClient';
import { CpfCnpjSchema } from '@/contracts/shared';
import type { Client } from '@/domain/clients/types';
import type { CommercialGroup, CommercialGroupWithMembers } from '@/domain/commercialGroups/types';
import {
  addCommercialGroupMember,
  createCommercialGroup,
  fetchCommercialGroup,
  fetchCommercialGroups,
  removeCommercialGroupMember,
  renameCommercialGroup,
  setCommercialGroupActive,
  setPrimaryCommercialGroupMember,
} from '@/workspace/lib/commercialGroupsClient';

function CreateGroupModal({ onClose, onCreated }: { onClose: () => void; onCreated: (group: CommercialGroup) => void }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) {
      setError('Informe o nome do grupo.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onCreated(await createCommercialGroup(name.trim()));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar o grupo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={adminUi.modalOverlay} role="dialog" aria-modal="true" aria-label="Criar grupo comercial">
      <section className={adminUi.modalPanel}>
        <header className={adminUi.modalHeader}>
          <h2 className="font-bold">Criar grupo comercial</h2>
          <button type="button" className={adminUi.iconButton} onClick={onClose} aria-label="Fechar"><X className="size-4" aria-hidden="true" /></button>
        </header>
        <div className={`${adminUi.modalBody} flex flex-col gap-4`}>
          <div className={adminUi.field}>
            <label>Nome do grupo</label>
            <input autoFocus value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); void submit(); }
            }} placeholder="Ex.: Rede Fulana de Tal" />
          </div>
          {error && <p className="text-sm text-[#b00020]">{error}</p>}
        </div>
        <footer className={adminUi.modalFooter}>
          <button type="button" className={adminUi.button} onClick={onClose}>Cancelar</button>
          <button type="button" className={adminUi.primaryButton} onClick={() => void submit()} disabled={saving}>{saving ? 'Criando...' : 'Criar grupo'}</button>
        </footer>
      </section>
    </div>
  );
}

function AddMemberSection({ group, onAdded }: { group: CommercialGroupWithMembers; onAdded: () => Promise<void> }) {
  const [mode, setMode] = useState<'search' | 'document'>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Client[]>([]);
  const [document, setDocument] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    const memberIds = new Set(group.members.map((member) => member.client.id));
    const timeout = window.setTimeout(() => {
      if (!q) {
        setResults([]);
        return;
      }
      searchOrderClients(q).then((found) => setResults(found.filter((c) => !memberIds.has(c.id)))).catch(() => {});
    }, q ? 250 : 0);
    return () => window.clearTimeout(timeout);
  }, [query, group.members]);

  async function addByClientId(clientId: string) {
    setAdding(true);
    setError(null);
    setMessage(null);
    try {
      await addCommercialGroupMember(group.id, { clientId });
      setQuery('');
      setResults([]);
      await onAdded();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível adicionar a cliente.');
    } finally {
      setAdding(false);
    }
  }

  async function addByDocument() {
    const parsed = CpfCnpjSchema.safeParse(document);
    if (!parsed.success) {
      setError('Informe um CPF com 11 dígitos ou um CNPJ com 14 dígitos.');
      return;
    }
    setAdding(true);
    setError(null);
    setMessage(null);
    try {
      const result = await addCommercialGroupMember(group.id, { document: parsed.data });
      setDocument('');
      await onAdded();
      setMessage(result.source === 'erp'
        ? `${result.member.client.name} foi importada do ERP e adicionada ao grupo.`
        : `${result.member.client.name} foi adicionada ao grupo.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível adicionar a cliente.');
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-border bg-surface-muted p-3">
      <div className="contents">
        <button type="button" className={mode === 'search' ? adminUi.primaryButton : adminUi.button} onClick={() => setMode('search')}>Buscar na base</button>
        <button type="button" className={mode === 'document' ? adminUi.primaryButton : adminUi.button} onClick={() => setMode('document')}>Adicionar por CPF/CNPJ</button>
      </div>

      {mode === 'search' ? (
        <div className={`${adminUi.field} mt-3 max-w-sm`}>
          <label>Nome, e-mail ou CPF/CNPJ</label>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente..." />
          {results.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {results.map((result) => (
                <li key={result.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm hover:border-brand-primary"
                    onClick={() => void addByClientId(result.id)}
                    disabled={adding}
                  >
                    <span>{result.name}</span>
                    <span className="text-xs text-muted-foreground">{result.cpfCnpj || 'sem CPF/CNPJ'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className={`${adminUi.field} max-w-xs`}>
            <label>CPF ou CNPJ</label>
            <input value={document} onChange={(event) => setDocument(event.target.value)} placeholder="000.000.000-00" onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); void addByDocument(); }
            }} />
          </div>
          <button type="button" className={adminUi.primaryButton} onClick={() => void addByDocument()} disabled={adding}>{adding ? 'Buscando...' : 'Buscar e adicionar'}</button>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-[#b00020]">{error}</p>}
      {message && <p className="mt-2 text-sm text-brand-primary">{message}</p>}
    </div>
  );
}

function GroupDetail({ groupId, onChanged, onClose }: { groupId: string; onChanged: () => Promise<void>; onClose: () => void }) {
  const [group, setGroup] = useState<CommercialGroupWithMembers | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      setGroup(await fetchCommercialGroup(groupId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o grupo.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  async function afterMutation() {
    await Promise.all([reload(), onChanged()]);
  }

  async function handleRemove(memberId: string) {
    setBusyMemberId(memberId);
    try {
      await removeCommercialGroupMember(groupId, memberId);
      await afterMutation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível remover a cliente do grupo.');
    } finally {
      setBusyMemberId(null);
    }
  }

  async function handleSetPrimary(memberId: string) {
    setBusyMemberId(memberId);
    try {
      await setPrimaryCommercialGroupMember(groupId, memberId);
      await afterMutation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível marcar a cliente como principal.');
    } finally {
      setBusyMemberId(null);
    }
  }

  return (
    <section className="mt-4 rounded-brand border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-bold">{group?.name || 'Carregando...'}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Membros deste grupo comercial.</p>
        </div>
        <button type="button" className={adminUi.button} onClick={onClose}>Fechar</button>
      </div>

      {loading && <p className="mt-3 text-sm text-muted-foreground">Carregando...</p>}
      {error && <p className="mt-3 text-sm text-[#b00020]">{error}</p>}

      {group && !loading && (
        <>
          {group.members.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Nenhuma cliente neste grupo ainda.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {group.members.map((member) => (
                <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm">
                  <div>
                    <p className="font-semibold text-foreground">{member.client.name}{member.isPrimary && <span className="ml-2 rounded-full bg-brand-primary/10 px-2 py-0.5 text-xs font-semibold text-brand-primary">Principal</span>}</p>
                    <p className="text-xs text-muted-foreground">{member.client.cpfCnpj || 'sem CPF/CNPJ'}</p>
                  </div>
                  <div className="flex gap-2">
                    {!member.isPrimary && (
                      <button type="button" className={adminUi.button} disabled={busyMemberId === member.id} onClick={() => void handleSetPrimary(member.id)}>Marcar como principal</button>
                    )}
                    <button type="button" className={adminUi.dangerButton} disabled={busyMemberId === member.id} onClick={() => void handleRemove(member.id)}>Remover</button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {group.isActive ? (
            <AddMemberSection group={group} onAdded={afterMutation} />
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Este grupo está inativo — reative-o para adicionar membros.</p>
          )}
        </>
      )}
    </section>
  );
}

export default function CommercialGroupsPanel() {
  const [groups, setGroups] = useState<CommercialGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setGroups(await fetchCommercialGroups({ includeInactive: true }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os grupos comerciais.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  async function handleToggleActive(group: CommercialGroup) {
    setBusyId(group.id);
    try {
      await setCommercialGroupActive(group.id, !group.isActive);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o status do grupo.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleRename(group: CommercialGroup) {
    if (!renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    setBusyId(group.id);
    try {
      await renameCommercialGroup(group.id, renameValue.trim());
      setRenamingId(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível renomear o grupo.');
    } finally {
      setBusyId(null);
    }
  }

  const filtered = query.trim()
    ? groups.filter((group) => group.name.toLowerCase().includes(query.trim().toLowerCase()))
    : groups;

  return (
    <section className="rounded-brand border border-border bg-surface p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-bold">Grupos comerciais</h2>
          <p className="mt-1 text-sm text-muted-foreground">Agrupe clientes já cadastradas sob uma mesma entidade, com uma marcada como principal.</p>
        </div>
        <button type="button" className={adminUi.primaryButton} onClick={() => setCreating(true)}>Criar grupo</button>
      </div>

      <div className={`${adminUi.field} mt-4 max-w-sm`}>
        <label htmlFor="commercial-groups-search">Buscar grupos</label>
        <input id="commercial-groups-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome do grupo..." />
      </div>

      {error && <p className="mt-3 text-sm text-[#b00020]">{error}</p>}

      <ResponsiveDataTable
        rows={filtered}
        rowKey={(group) => group.id}
        loading={loading}
        emptyMessage="Nenhum grupo comercial encontrado."
        columns={[
          {
            key: 'name',
            header: 'Nome',
            cell: (group) => renamingId === group.id ? (
              <input
                autoFocus
                className="w-full rounded-lg border border-[#ddd] bg-white px-2 py-1 text-sm"
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                onBlur={() => void handleRename(group)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') { event.preventDefault(); void handleRename(group); }
                  if (event.key === 'Escape') setRenamingId(null);
                }}
              />
            ) : (
              <button type="button" className="font-semibold text-foreground hover:text-brand-primary" onClick={() => { setRenamingId(group.id); setRenameValue(group.name); }}>
                {group.name}
              </button>
            ),
          },
          { key: 'status', header: 'Status', cell: (group) => group.isActive ? <span className="text-brand-primary">Ativo</span> : <span className="text-muted-foreground">Inativo</span> },
          { key: 'createdAt', header: 'Criado em', cell: (group) => new Date(group.createdAt).toLocaleDateString('pt-BR') },
          {
            key: 'actions',
            header: '',
            cell: (group) => (
              <div className="flex justify-end gap-2">
                <button type="button" className={adminUi.button} onClick={() => setSelectedGroupId(group.id)}>Gerenciar membros</button>
                <button type="button" className={group.isActive ? adminUi.dangerButton : adminUi.button} disabled={busyId === group.id} onClick={() => void handleToggleActive(group)}>
                  {group.isActive ? 'Desativar' : 'Ativar'}
                </button>
              </div>
            ),
          },
        ]}
        mobileCard={(group) => (
          <div className="rounded-brand border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-foreground">{group.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{group.isActive ? 'Ativo' : 'Inativo'} · desde {new Date(group.createdAt).toLocaleDateString('pt-BR')}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={adminUi.button} onClick={() => setSelectedGroupId(group.id)}>Gerenciar membros</button>
              <button type="button" className={group.isActive ? adminUi.dangerButton : adminUi.button} disabled={busyId === group.id} onClick={() => void handleToggleActive(group)}>
                {group.isActive ? 'Desativar' : 'Ativar'}
              </button>
            </div>
          </div>
        )}
      />

      {selectedGroupId && (
        <GroupDetail groupId={selectedGroupId} onChanged={load} onClose={() => setSelectedGroupId(null)} />
      )}

      {creating && (
        <CreateGroupModal
          onClose={() => setCreating(false)}
          onCreated={(group) => {
            setCreating(false);
            void load();
            setSelectedGroupId(group.id);
          }}
        />
      )}
    </section>
  );
}
