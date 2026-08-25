'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import type { ClientWithLogin } from '@/domain/clients/types';
import type { Order } from '@/domain/orders/types';
import Link from '@/components/TenantLink';
import { adminUi } from '@/workspace/lib/ui';
import { HubHeader } from '@/workspace/components/shared/HubHeader';
import { ResponsiveDataTable } from '@/workspace/components/shared/ResponsiveDataTable';
import { syncClientFromErp } from '@/workspace/lib/customersClient';
import {
  addCommercialGroupMember,
  fetchCommercialGroup,
  fetchCommercialGroupMembershipsByClientIds,
  fetchErpRelatedPartiesAvailable,
  fetchErpRelatedPartiesForClient,
  removeCommercialGroupMember,
  type CommercialGroupMemberWithClient,
  type CommercialGroupWithMembers,
  type ErpRelatedParty,
} from '@/workspace/lib/commercialGroupsClient';
import { fetchOrders } from '@/lib/ordersClient';
import { useUpdatesRealtime } from '@/lib/realtime/useUpdatesRealtime';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function itemCount(items: Order['items']) {
  return items.reduce((sum, item) => sum + item.qty, 0);
}

const FIELD_LABELS: Record<string, string> = {
  cpfCnpj: 'CPF/CNPJ',
  email: 'E-mail',
  cep: 'CEP',
  street: 'Rua',
  number: 'Número',
  complement: 'Complemento',
  neighborhood: 'Bairro',
  city: 'Cidade',
  state: 'Estado',
};

function InfoField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm text-foreground">{value?.trim() || <span className="text-muted-foreground">Não informado</span>}</p>
    </div>
  );
}

function digitsOnly(value: string | undefined | null): string {
  return (value ?? '').replace(/\D/g, '');
}

// Coligados do TOTVS Moda pro documento desta cliente (ver
// fetchErpRelatedPartiesForClient) — só faz sentido depois que a cliente já
// tem um grupo comercial (é nele que os coligados entram), por isso esta
// seção só aparece dentro do bloco "com grupo" de GroupMembershipSection.
// Busca sob demanda: nada de chamar o ERP em toda visita à página, só
// quando a vendedora clica em "Buscar". Adicionar um coligado reaproveita
// addCommercialGroupMember({document}) — o mesmo fluxo de registrar/importar
// e vincular já usado pela busca manual por documento na aba "Grupos
// comerciais" (ver CommercialGroupsPanel.tsx); nada de lógica nova aqui.
function RelatedPartiesSection({ clientId, groupId, memberDocuments, onAdded }: { clientId: string; groupId: string; memberDocuments: Set<string>; onAdded: () => Promise<void> }) {
  const [parties, setParties] = useState<ErpRelatedParty[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [addingDocument, setAddingDocument] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    setSearching(true);
    setError(null);
    try {
      setParties(await fetchErpRelatedPartiesForClient(clientId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível buscar coligados no ERP.');
    } finally {
      setSearching(false);
    }
  }

  async function add(party: ErpRelatedParty) {
    setAddingDocument(party.cpfCnpj);
    setError(null);
    try {
      await addCommercialGroupMember(groupId, { document: party.cpfCnpj });
      await onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível adicionar o coligado ao grupo.');
    } finally {
      setAddingDocument(null);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-border bg-surface-muted p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">Coligados no TOTVS</p>
          <p className="text-xs text-muted-foreground">Consulta os coligados desta cliente no ERP e vincula ao mesmo grupo comercial.</p>
        </div>
        <button type="button" className={adminUi.button} onClick={() => void search()} disabled={searching}>
          {searching ? 'Buscando...' : 'Buscar coligados'}
        </button>
      </div>

      {parties && (
        parties.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nenhum coligado encontrado no TOTVS para esta cliente.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {parties.map((party) => {
              const already = memberDocuments.has(digitsOnly(party.cpfCnpj));
              return (
                <li key={party.cpfCnpj} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium text-foreground">{party.name}</p>
                    <p className="text-xs text-muted-foreground">{party.cpfCnpj}</p>
                  </div>
                  <button
                    type="button"
                    className={adminUi.button}
                    disabled={already || addingDocument === party.cpfCnpj}
                    onClick={() => void add(party)}
                  >
                    {already ? 'Já no grupo' : addingDocument === party.cpfCnpj ? 'Adicionando...' : 'Adicionar ao grupo'}
                  </button>
                </li>
              );
            })}
          </ul>
        )
      )}

      {error && <p className="mt-2 text-sm text-[#b00020]">{error}</p>}
    </div>
  );
}

// Composição de matriz/filiais pra clientes de atacado que compram por
// várias lojas de uma vez — vem de commercial_group_members (ver migration
// 028, que aposentou clients.parent_client_id em favor disso). Só leitura +
// remoção aqui; criar grupo, adicionar membro por busca/documento e marcar
// principal já têm CRUD completo na aba "Grupos comerciais" do hub de
// clientes (ver CommercialGroupsPanel.tsx) — não duplicar esse fluxo aqui.
function GroupMembershipSection({ client }: { client: ClientWithLogin }) {
  const [membership, setMembership] = useState<CommercialGroupMemberWithClient | null>(null);
  const [group, setGroup] = useState<CommercialGroupWithMembers | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Tenant tem TOTVS Moda configurado e ativo? Checagem leve (sem chamar o
  // ERP, ver hasErpRelatedPartiesCapability), independente da cliente
  // aberta — por isso não entra em `reload` (que é por client.id).
  const [erpAvailable, setErpAvailable] = useState(false);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const memberships = await fetchCommercialGroupMembershipsByClientIds([client.id]);
      const own = memberships[0] ?? null;
      setMembership(own);
      setGroup(own ? await fetchCommercialGroup(own.groupId) : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar o grupo comercial.');
    } finally {
      setLoaded(true);
    }
  }, [client.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  useEffect(() => {
    fetchErpRelatedPartiesAvailable().then(setErpAvailable).catch(() => {});
  }, []);

  async function unlink() {
    if (!membership) return;
    setRemoving(true);
    setError(null);
    try {
      await removeCommercialGroupMember(membership.groupId, membership.id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível desvincular.');
    } finally {
      setRemoving(false);
    }
  }

  const siblings = group?.members.filter((member) => member.clientId !== client.id) ?? [];
  const memberDocuments = new Set((group?.members ?? []).map((member) => digitsOnly(member.client.cpfCnpj)));

  return (
    <section className="rounded-brand border border-border bg-surface p-4">
      <h2 className="font-bold">Cliente master / filiais</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Pra clientes de atacado que compram por várias lojas de uma vez — gerencie a composição na aba &quot;Grupos comerciais&quot; do hub de clientes.
      </p>

      {loaded && membership && group ? (
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm">
            <span>
              {membership.isPrimary ? 'Matriz do grupo' : 'Filial do grupo'}{' '}
              <span className="font-semibold">{group.name}</span>
            </span>
            <button type="button" className={adminUi.button} onClick={unlink} disabled={removing}>Desvincular</button>
          </div>
          {siblings.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground">Outros membros do grupo</p>
              <ul className="mt-1 flex flex-col gap-1">
                {siblings.map((sibling) => (
                  <li key={sibling.id}>
                    <Link href={`/workspace/clientes/${sibling.clientId}`} className="text-sm font-semibold text-brand-primary hover:underline">
                      {sibling.client.name}{sibling.isPrimary ? ' · matriz' : ''}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {erpAvailable && (
            <RelatedPartiesSection clientId={client.id} groupId={membership.groupId} memberDocuments={memberDocuments} onAdded={reload} />
          )}
        </div>
      ) : loaded ? (
        <p className="mt-3 text-sm text-muted-foreground">Esta cliente não faz parte de nenhum grupo comercial.</p>
      ) : null}

      {error && <p className="mt-2 text-sm text-[#b00020]">{error}</p>}
    </section>
  );
}

export default function ClientDetailApp({
  initialClient,
  initialOrders,
}: {
  initialClient: ClientWithLogin;
  initialOrders: Order[];
}) {
  const [client, setClient] = useState(initialClient);
  const [orders, setOrders] = useState(initialOrders);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);

  const refreshOrders = useCallback(async () => {
    try {
      setOrders(await fetchOrders({ clientId: client.id }));
    } catch {
      // Mantém o histórico atual quando a atualização em segundo plano falhar.
    }
  }, [client.id]);

  useUpdatesRealtime((update) => {
    if (update === 'orders_updated') void refreshOrders();
  });

  async function handleSync() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await syncClientFromErp(client.id);
      // A sincronização atualiza apenas o perfil comercial; `hasLogin` é
      // calculado no GET de detalhe e não faz parte da resposta do ERP.
      setClient((current) => ({ ...result.client, hasLogin: current.hasLogin }));
      setSyncMessage(
        result.updatedFields.length > 0
          ? { type: 'success', text: `Atualizado com dados do ERP: ${result.updatedFields.map((field) => FIELD_LABELS[field] ?? field).join(', ')}.` }
          : { type: 'info', text: 'Cadastro já estava completo — nenhum dado novo encontrado no ERP.' },
      );
    } catch (cause) {
      setSyncMessage({ type: 'error', text: cause instanceof Error ? cause.message : 'Não foi possível sincronizar com o ERP.' });
    } finally {
      setSyncing(false);
    }
  }

  const address = [client.street, client.number].filter(Boolean).join(', ')
    || undefined;

  return (
    <div>
      <HubHeader
        title={client.name}
        description={client.hasLogin ? 'Cadastro com login ativo.' : 'Cadastro sem login.'}
        secondaryActions={
          <Link href="/workspace/clientes" className={adminUi.button}>
            <ArrowLeft className="mr-1.5 inline size-3.5" aria-hidden="true" />Voltar
          </Link>
        }
        primaryAction={{
          label: syncing ? 'Sincronizando...' : 'Sincronizar com ERP',
          onClick: () => void handleSync(),
          disabled: syncing,
          icon: <RefreshCw className={`mr-1.5 inline size-3.5 ${syncing ? 'animate-spin' : ''}`} aria-hidden="true" />,
        }}
      />

      <main className={`${adminUi.productsEditor} flex flex-col gap-6`}>
        {syncMessage && (
          <p
            className={`rounded-brand border p-3 text-sm ${
              syncMessage.type === 'error'
                ? 'border-[#dba0a0] bg-[#fff1f1] text-[#b00020]'
                : syncMessage.type === 'success'
                  ? 'border-brand-primary/30 bg-brand-primary/8 text-brand-primary'
                  : 'border-border bg-surface text-muted-foreground'
            }`}
          >
            {syncMessage.text}
          </p>
        )}

        <section className="rounded-brand border border-border bg-surface p-4">
          <h2 className="font-bold">Cadastro</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoField label="CPF/CNPJ" value={client.cpfCnpj} />
            <InfoField label="E-mail" value={client.email} />
            <InfoField label="CEP" value={client.cep} />
            <InfoField label="Endereço" value={address} />
            <InfoField label="Complemento" value={client.complement} />
            <InfoField label="Bairro" value={client.neighborhood} />
            <InfoField label="Cidade" value={client.city} />
            <InfoField label="Estado" value={client.state} />
            <InfoField label="Cadastro desde" value={new Date(client.createdAt).toLocaleDateString('pt-BR')} />
          </div>
        </section>

        <GroupMembershipSection client={client} />

        <section className="rounded-brand border border-border bg-surface p-4">
          <div>
            <h2 className="font-bold">Pedidos</h2>
            <p className="mt-1 text-sm text-muted-foreground">Histórico de compras desta cliente.</p>
          </div>
          <ResponsiveDataTable
            rows={orders}
            rowKey={(order) => order.id}
            emptyMessage="Nenhum pedido encontrado para esta cliente."
            columns={[
              { key: 'date', header: 'Data', cell: (order) => new Date(order.date).toLocaleString('pt-BR') },
              { key: 'status', header: 'Status', cell: (order) => order.status },
              { key: 'channel', header: 'Canal', cell: (order) => order.channel },
              { key: 'payment', header: 'Pagamento', cell: (order) => order.paymentMethod || '—' },
              { key: 'items', header: 'Peças', cell: (order) => itemCount(order.items) },
              { key: 'total', header: 'Total', cell: (order) => formatCurrency(order.total) },
            ]}
            mobileCard={(order) => (
              <div className="rounded-brand border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-muted-foreground">{new Date(order.date).toLocaleString('pt-BR')} · {order.channel}</p>
                  <span className="shrink-0 font-bold text-foreground">{formatCurrency(order.total)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{itemCount(order.items)} peças · {order.paymentMethod || '—'}</span>
                  <span className="text-muted-foreground">{order.status}</span>
                </div>
              </div>
            )}
          />
        </section>
      </main>
    </div>
  );
}
