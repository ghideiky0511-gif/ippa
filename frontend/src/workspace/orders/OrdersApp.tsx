'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Order, OrderSession } from '@/domain/orders/types';
import { adminUi } from '@/workspace/lib/ui';
import { fetchOrders, fetchOrderSessions } from '@/workspace/lib/ordersClient';
import { HubHeader } from '@/workspace/components/shared/HubHeader';
import { KpiCard } from '@/workspace/components/shared/KpiCard';
import { ResponsiveDataTable } from '@/workspace/components/shared/ResponsiveDataTable';
import { CreateOrderModal } from './OrderTalaoModal';
import Link from '@/components/TenantLink';
import { apiEventSource } from '@/lib/api-client';

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

export default function OrdersApp({
  initialOrders,
  initialSessions,
}: {
  initialOrders: Order[];
  initialSessions: OrderSession[];
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [sessions, setSessions] = useState(initialSessions);
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isCreating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [nextOrders, nextSessions] = await Promise.all([fetchOrders(), fetchOrderSessions()]);
      setOrders(nextOrders);
      setSessions(nextSessions);
    } catch {
      // Mantém os dados atuais se a atualização em segundo plano falhar.
    }
  }, []);

  useEffect(() => {
    const source = apiEventSource('/api/sessions/stream');
    source.addEventListener('sessions-updated', refresh);
    source.addEventListener('orders-updated', refresh);
    return () => source.close();
  }, [refresh]);

  const normalizedQuery = query.trim().toLowerCase();
  const activeSessions = useMemo(() => sessions.filter((session) => session.status === 'aberto' || session.status === 'aguardando_pagamento'), [sessions]);
  const filteredSessions = useMemo(() => {
    if (!normalizedQuery) return activeSessions;
    return activeSessions.filter((session) =>
      [session.id, session.clientName, session.channel, STATUS_LABELS[session.status]]
        .some((value) => value.toLowerCase().includes(normalizedQuery)),
    );
  }, [activeSessions, normalizedQuery]);
  const filteredOrders = useMemo(() => {
    if (!normalizedQuery) return orders;
    return orders.filter((order) =>
      [order.id, order.clientName, order.paymentMethod, order.channel]
        .some((value) => value?.toLowerCase().includes(normalizedQuery)),
    );
  }, [orders, normalizedQuery]);

  const kpis = useMemo(() => {
    const open = activeSessions.filter((session) => session.status === 'aberto');
    const awaiting = activeSessions.filter((session) => session.status === 'aguardando_pagamento');
    const sold = orders.reduce((sum, order) => sum + order.total, 0);
    return {
      open,
      awaiting,
      sold,
      average: orders.length ? sold / orders.length : 0,
    };
  }, [activeSessions, orders]);

  return (
    <div>
      <HubHeader
        title="Hub de pedidos"
        description="Acompanhe talões em atendimento e o histórico de vendas."
        primaryAction={{ label: 'Criar pedido', onClick: () => setCreating(true) }}
      />

      <main className={`${adminUi.productsEditor} flex flex-col gap-6`}>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard label="Em montagem" value={formatCurrency(kpis.open.reduce((sum, session) => sum + sessionTotal(session), 0))} hint={`${kpis.open.length} pedidos`} />
          <KpiCard label="Aguardando pagamento" value={formatCurrency(kpis.awaiting.reduce((sum, session) => sum + sessionTotal(session), 0))} hint={`${kpis.awaiting.length} pedidos`} />
          <KpiCard label="Concluídos" value={formatCurrency(kpis.sold)} hint={`${orders.length} pedidos · histórico`} />
          <KpiCard label="Ticket médio" value={formatCurrency(kpis.average)} hint={`${orders.length} pedidos · concluídos`} />
          <KpiCard label="Em atendimento" value={formatCurrency(activeSessions.reduce((sum, session) => sum + sessionTotal(session), 0))} hint={`${activeSessions.length} pedidos · valor potencial`} />
        </section>

        <section className="rounded-brand border border-border bg-surface p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-bold">Pedidos em andamento</h2>
              <p className="mt-1 text-sm text-muted-foreground">Abra o talão para vincular cliente, adicionar peças ou finalizar.</p>
            </div>
            <div className={`${adminUi.field} w-full sm:w-80`}>
              <label>Buscar pedidos</label>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cliente, status, canal ou ID..." />
            </div>
          </div>
          <ResponsiveDataTable
            rows={filteredSessions}
            rowKey={(session) => session.id}
            emptyMessage="Nenhum pedido em andamento."
            columns={[
              { key: 'updatedAt', header: 'Atualização', cell: (session) => new Date(session.updatedAt).toLocaleString('pt-BR') },
              { key: 'client', header: 'Cliente', cell: (session) => session.clientId ? session.clientName : <span className="text-muted-foreground">Sem cliente</span> },
              { key: 'status', header: 'Status', cell: (session) => <span className="rounded-full bg-brand-background px-2 py-1 text-xs font-semibold text-brand-primary">{STATUS_LABELS[session.status]}</span> },
              { key: 'channel', header: 'Canal', cell: (session) => session.channel },
              { key: 'items', header: 'Peças', cell: (session) => itemCount(session.items) },
              { key: 'total', header: 'Total', cell: (session) => formatCurrency(sessionTotal(session)) },
              { key: 'actions', header: '', cell: () => <Link href="/workspace/catalogo" className={adminUi.button}>Abrir no catálogo</Link> },
            ]}
            mobileCard={(session) => (
              <Link href="/workspace/catalogo" className="block rounded-brand border border-border bg-surface p-4 active:scale-[.99]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{session.clientId ? session.clientName : 'Sem cliente'}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{new Date(session.updatedAt).toLocaleString('pt-BR')} · {session.channel}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-brand-background px-2 py-1 text-xs font-semibold text-brand-primary">{STATUS_LABELS[session.status]}</span>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{itemCount(session.items)} peças</span>
                  <span className="font-bold text-foreground">{formatCurrency(sessionTotal(session))}</span>
                </div>
              </Link>
            )}
          />
        </section>

        <section className="rounded-brand border border-border bg-surface p-4">
          <div>
            <h2 className="font-bold">Pedidos concluídos</h2>
            <p className="mt-1 text-sm text-muted-foreground">Histórico financeiro já finalizado.</p>
          </div>
          <ResponsiveDataTable
            rows={filteredOrders}
            rowKey={(order) => order.id}
            emptyMessage="Nenhum pedido concluído."
            columns={[
              { key: 'date', header: 'Data', cell: (order) => new Date(order.date).toLocaleString('pt-BR') },
              { key: 'client', header: 'Cliente', cell: (order) => order.clientName || '—' },
              { key: 'channel', header: 'Canal', cell: (order) => order.channel },
              { key: 'payment', header: 'Pagamento', cell: (order) => order.paymentMethod || '—' },
              { key: 'items', header: 'Peças', cell: (order) => itemCount(order.items) },
              { key: 'total', header: 'Total', cell: (order) => formatCurrency(order.total) },
              {
                key: 'actions',
                header: '',
                cell: (order) => {
                  const isExpanded = expandedId === order.id;
                  return (
                    <>
                      <button type="button" className={adminUi.button} onClick={() => setExpandedId(isExpanded ? null : order.id)}>{isExpanded ? 'Ocultar itens' : 'Ver itens'}</button>
                      {isExpanded && <div className="mt-2 min-w-56 text-xs text-muted-foreground">{order.items.map((item) => <div key={item.key}>{item.qty}× {item.name}{item.color ? ` · ${item.color}` : ''}{item.size ? ` · ${item.size}` : ''}</div>)}</div>}
                    </>
                  );
                },
              },
            ]}
            mobileCard={(order) => {
              const isExpanded = expandedId === order.id;
              return (
                <div className="rounded-brand border border-border bg-surface p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground">{order.clientName || '—'}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{new Date(order.date).toLocaleString('pt-BR')} · {order.channel}</p>
                    </div>
                    <span className="shrink-0 font-bold text-foreground">{formatCurrency(order.total)}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{itemCount(order.items)} peças · {order.paymentMethod || '—'}</span>
                    <button type="button" className={adminUi.button} onClick={() => setExpandedId(isExpanded ? null : order.id)}>{isExpanded ? 'Ocultar' : 'Ver itens'}</button>
                  </div>
                  {isExpanded && <div className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">{order.items.map((item) => <div key={item.key}>{item.qty}× {item.name}{item.color ? ` · ${item.color}` : ''}{item.size ? ` · ${item.size}` : ''}</div>)}</div>}
                </div>
              );
            }}
          />
        </section>
      </main>

      {isCreating && <CreateOrderModal onClose={() => setCreating(false)} onCreated={(session) => {
        setSessions((current) => [session, ...current]);
        setCreating(false);
      }} />}
    </div>
  );
}
