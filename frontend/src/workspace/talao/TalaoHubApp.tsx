'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { OrderBook, OrderSession } from '@/domain/orders/types';
import { adminUi } from '@/workspace/lib/ui';
import { clientSubtext } from '@/lib/document';
import { createOrderSession, fetchActiveOrderBook, fetchOrderBooks, fetchOrderSessions } from '@/lib/ordersClient';
import {
  fetchCommercialGroup,
  fetchCommercialGroupMembershipsByClientIds,
  type CommercialGroupWithMembers,
} from '@/workspace/lib/commercialGroupsClient';
import { HubHeader } from '@/workspace/components/shared/HubHeader';
import { KpiCard } from '@/workspace/components/shared/KpiCard';
import { ResponsiveDataTable } from '@/workspace/components/shared/ResponsiveDataTable';
import Link from '@/components/TenantLink';
import { useUpdatesRealtime } from '@/lib/realtime/useUpdatesRealtime';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function sessionTotal(session: Pick<OrderSession, 'items' | 'shipping'>) {
  return session.items.reduce((sum, item) => sum + item.price * item.qty, 0) + (session.shipping?.price ?? 0);
}

function itemCount(items: OrderSession['items']) {
  return items.reduce((sum, item) => sum + item.qty, 0);
}

const STATUS_LABELS: Record<OrderSession['status'], string> = {
  aberto: 'Em montagem',
  aguardando_pagamento: 'Aguardando pagamento',
  fechado: 'Finalizado',
  cancelado: 'Cancelado',
};

const BOOK_STATUS_LABELS: Record<OrderBook['status'], string> = {
  aberto: 'Aberto',
  fechado: 'Fechado',
};

// Cliente master (membro principal de um grupo comercial) compra por si e
// por várias filiais (os demais membros do grupo) de uma vez — a vendedora
// chega aqui (em vez de ficar no drawer) pra montar o atendimento de todo o
// grupo com mais espaço. Decisão combinada com o usuário: o redirecionamento
// acontece ao vincular a master num pedido (ver TalaoDrawer.tsx,
// ClientCadastroSection.redirectIfMaster).
function GroupSetupSection({
  masterId,
  sessions,
  onCreated,
}: {
  masterId: string;
  sessions: OrderSession[];
  onCreated: (session: OrderSession) => void;
}) {
  const [group, setGroup] = useState<CommercialGroupWithMembers | null>(null);
  const [bookId, setBookId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    Promise.all([fetchCommercialGroupMembershipsByClientIds([masterId]), fetchActiveOrderBook()])
      .then(async ([memberships, activeBook]) => {
        const own = memberships[0];
        setGroup(own ? await fetchCommercialGroup(own.groupId) : null);
        setBookId(activeBook.id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível carregar o grupo.'))
      .finally(() => setLoading(false));
  }, [masterId]);

  const members = group?.members ?? [];
  const primary = members.find((member) => member.isPrimary) ?? null;
  const sessionByClientId = useMemo(() => {
    const map = new Map<string, OrderSession>();
    for (const session of sessions) {
      if (session.clientId && (session.status === 'aberto' || session.status === 'aguardando_pagamento')) {
        map.set(session.clientId, session);
      }
    }
    return map;
  }, [sessions]);

  async function createFor(clientId: string, clientName: string) {
    if (!bookId) return;
    setCreatingId(clientId);
    setError(null);
    try {
      onCreated(await createOrderSession({ clientId, clientName, channel: 'presencial', orderBookId: bookId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar o pedido.');
    } finally {
      setCreatingId(null);
    }
  }

  async function createForAll() {
    for (const member of members) {
      if (!sessionByClientId.has(member.clientId)) await createFor(member.clientId, member.client.name);
    }
  }

  if (loading || !group || !primary) return null;

  return (
    <section className="rounded-brand border-2 border-brand-primary bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-bold">Atendimento em grupo — {primary.client.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cliente master com {members.length - 1} filial{members.length - 1 === 1 ? '' : 'is'} — crie o pedido de
            cada uma pra montar o talão do grupo inteiro de uma vez.
          </p>
        </div>
        <button type="button" className={adminUi.button} onClick={() => void createForAll()}>Criar pedido pra todas</button>
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {members.map((member) => {
          const existing = sessionByClientId.get(member.clientId);
          const subtext = clientSubtext(member.client);
          return (
            <li key={member.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground">
                  {member.client.name}
                  {member.isPrimary && (
                    <span className="ml-2 rounded-full bg-brand-background px-2 py-0.5 text-xs font-semibold text-brand-primary">matriz</span>
                  )}
                </p>
                {subtext && <p className="text-xs text-muted-foreground">{subtext}</p>}
              </div>
              {existing ? (
                <Link href={`/catalogo?session=${encodeURIComponent(existing.id)}`} className={adminUi.button}>Já no talão · continuar</Link>
              ) : (
                <button type="button" className={adminUi.button} onClick={() => void createFor(member.clientId, member.client.name)} disabled={creatingId === member.clientId}>
                  {creatingId === member.clientId ? 'Criando…' : 'Criar pedido'}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {error && <p className="mt-2 text-sm text-[#b00020]">{error}</p>}
    </section>
  );
}

export default function TalaoHubApp({
  initialBooks,
  initialSessions,
}: {
  initialBooks: OrderBook[];
  initialSessions: OrderSession[];
}) {
  const [books, setBooks] = useState(initialBooks);
  const [sessions, setSessions] = useState(initialSessions);
  const [query, setQuery] = useState('');
  const masterId = useSearchParams().get('masterId');

  const refresh = useCallback(async () => {
    try {
      const [nextBooks, nextSessions] = await Promise.all([fetchOrderBooks(), fetchOrderSessions()]);
      setBooks(nextBooks);
      setSessions(nextSessions);
    } catch {
      // Mantém os dados atuais se a atualização em segundo plano falhar.
    }
  }, []);

  useUpdatesRealtime((update) => {
    if (update === 'sessions_updated' || update === 'order_books_updated') void refresh();
  });

  const normalizedQuery = query.trim().toLowerCase();
  const filteredSessions = useMemo(() => {
    if (!normalizedQuery) return sessions;
    return sessions.filter((session) => session.clientName.toLowerCase().includes(normalizedQuery));
  }, [sessions, normalizedQuery]);

  const activeSessions = useMemo(
    () => sessions.filter((session) => session.status === 'aberto' || session.status === 'aguardando_pagamento'),
    [sessions],
  );

  const kpis = useMemo(() => ({
    openBooks: books.filter((book) => book.status === 'aberto').length,
    activeCount: activeSessions.length,
    activeValue: activeSessions.reduce((sum, session) => sum + sessionTotal(session), 0),
  }), [books, activeSessions]);

  const sessionsByBook = useMemo(() => {
    const map = new Map<string, OrderSession[]>();
    for (const session of filteredSessions) {
      const list = map.get(session.orderBookId);
      if (list) list.push(session);
      else map.set(session.orderBookId, [session]);
    }
    return map;
  }, [filteredSessions]);

  const visibleBooks = books.filter((book) => (sessionsByBook.get(book.id)?.length ?? 0) > 0);

  return (
    <div>
      <HubHeader
        title="Talão"
        description="Clientes que passaram ou estão passando pelos seus talões — histórico completo por atendimento."
      />

      <main className={`${adminUi.productsEditor} flex flex-col gap-6`}>
        {masterId && (
          <GroupSetupSection
            masterId={masterId}
            sessions={sessions}
            onCreated={(session) => setSessions((current) => [session, ...current])}
          />
        )}

        <section className="grid gap-3 sm:grid-cols-3">
          <KpiCard label="Talões abertos" value={String(kpis.openBooks)} hint={`${books.length} no total`} />
          <KpiCard label="Atendimentos ativos" value={String(kpis.activeCount)} hint="Em montagem ou aguardando pagamento" />
          <KpiCard label="Valor em aberto" value={formatCurrency(kpis.activeValue)} hint="Soma dos atendimentos ativos" />
        </section>

        <div className={`${adminUi.field} w-full sm:w-80`}>
          <label>Buscar cliente</label>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome da cliente..." />
        </div>

        {visibleBooks.length === 0 && (
          <p className={adminUi.previewEmpty}>Nenhum talão encontrado.</p>
        )}

        {visibleBooks.map((book) => {
          const bookSessions = sessionsByBook.get(book.id) ?? [];
          return (
            <section key={book.id} className="rounded-brand border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-bold">
                    {book.name}
                    {book.isActive && <span className="ml-2 rounded-full bg-brand-background px-2 py-0.5 text-xs font-semibold text-brand-primary">atual</span>}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {BOOK_STATUS_LABELS[book.status]} · atualizado em {new Date(book.updatedAt).toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>

              <ResponsiveDataTable
                rows={bookSessions}
                rowKey={(session) => session.id}
                emptyMessage="Nenhum atendimento neste talão."
                columns={[
                  {
                    key: 'client',
                    header: 'Cliente',
                    cell: (session) => session.clientId
                      ? <Link href={`/workspace/clientes/${session.clientId}`} className="font-semibold text-brand-primary hover:underline">{session.clientName}</Link>
                      : <span className="text-muted-foreground">Sem cliente</span>,
                  },
                  { key: 'channel', header: 'Canal', cell: (session) => session.channel },
                  { key: 'status', header: 'Status', cell: (session) => <span className="rounded-full bg-brand-background px-2 py-1 text-xs font-semibold text-brand-primary">{STATUS_LABELS[session.status]}</span> },
                  { key: 'items', header: 'Peças', cell: (session) => itemCount(session.items) },
                  { key: 'total', header: 'Total', cell: (session) => formatCurrency(sessionTotal(session)) },
                  { key: 'updatedAt', header: 'Atualização', cell: (session) => new Date(session.updatedAt).toLocaleString('pt-BR') },
                  {
                    key: 'actions',
                    header: '',
                    cell: (session) => (session.status === 'aberto' || session.status === 'aguardando_pagamento')
                      ? <Link href={`/catalogo?session=${encodeURIComponent(session.id)}`} className={adminUi.button}>Continuar no talão</Link>
                      : null,
                  },
                ]}
                mobileCard={(session) => (
                  <div className="rounded-brand border border-border bg-surface p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {session.clientId
                          ? <Link href={`/workspace/clientes/${session.clientId}`} className="truncate font-semibold text-brand-primary hover:underline">{session.clientName}</Link>
                          : <p className="truncate font-semibold text-muted-foreground">Sem cliente</p>}
                        <p className="mt-0.5 text-xs text-muted-foreground">{new Date(session.updatedAt).toLocaleString('pt-BR')} · {session.channel}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-brand-background px-2 py-1 text-xs font-semibold text-brand-primary">{STATUS_LABELS[session.status]}</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{itemCount(session.items)} peças</span>
                      <span className="font-bold text-foreground">{formatCurrency(sessionTotal(session))}</span>
                    </div>
                    {(session.status === 'aberto' || session.status === 'aguardando_pagamento') && (
                      <Link href={`/catalogo?session=${encodeURIComponent(session.id)}`} className={`${adminUi.button} mt-3 block text-center`}>Continuar no talão</Link>
                    )}
                  </div>
                )}
              />
            </section>
          );
        })}
      </main>
    </div>
  );
}
