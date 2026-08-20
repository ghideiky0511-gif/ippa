'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Order, OrderSession } from '@/domain/orders/types';
import { adminUi } from '@/workspace/lib/ui';
import { fetchOrders, fetchOrderSessions } from '@/workspace/lib/ordersClient';
import WorkspaceNav from '@/workspace/navigation/WorkspaceNav';
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

function KpiCard({ label, count, value, hint }: { label: string; count: number; value: string; hint?: string }) {
  return (
    <article className="rounded-brand border border-[#eee] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,.05)]">
      <p className="text-sm text-brand-muted">{label}</p>
      <p className="mt-2 text-2xl font-bold text-brand-text">{value}</p>
      <p className="mt-1 text-xs text-brand-muted">{count} {count === 1 ? 'pedido' : 'pedidos'}{hint ? ` · ${hint}` : ''}</p>
    </article>
  );
}

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
      <div className={adminUi.topbar}>
        <div className={adminUi.topbarLeft}>
          <h1>Hub de pedidos</h1>
          <WorkspaceNav />
        </div>
        <button type="button" className={adminUi.primaryButton} onClick={() => setCreating(true)}>+ Criar pedido</button>
      </div>

      <main className={`${adminUi.productsEditor} flex flex-col gap-6`}>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard label="Em montagem" count={kpis.open.length} value={formatCurrency(kpis.open.reduce((sum, session) => sum + sessionTotal(session), 0))} />
          <KpiCard label="Aguardando pagamento" count={kpis.awaiting.length} value={formatCurrency(kpis.awaiting.reduce((sum, session) => sum + sessionTotal(session), 0))} />
          <KpiCard label="Concluídos" count={orders.length} value={formatCurrency(kpis.sold)} hint="histórico" />
          <KpiCard label="Ticket médio" count={orders.length} value={formatCurrency(kpis.average)} hint="concluídos" />
          <KpiCard label="Em atendimento" count={activeSessions.length} value={formatCurrency(activeSessions.reduce((sum, session) => sum + sessionTotal(session), 0))} hint="valor potencial" />
        </section>

        <section className="rounded-brand border border-[#eee] bg-white p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-bold">Pedidos em andamento</h2>
              <p className="mt-1 text-sm text-brand-muted">Abra o talão para vincular cliente, adicionar peças ou finalizar.</p>
            </div>
            <div className={`${adminUi.field} w-full sm:w-80`}>
              <label>Buscar pedidos</label>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cliente, status, canal ou ID..." />
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className={adminUi.table}>
              <thead><tr><th>Atualização</th><th>Cliente</th><th>Status</th><th>Canal</th><th>Peças</th><th>Total</th><th /></tr></thead>
              <tbody>
                {filteredSessions.map((session) => (
                  <tr key={session.id}>
                    <td>{new Date(session.updatedAt).toLocaleString('pt-BR')}</td>
                    <td>{session.clientId ? session.clientName : <span className="text-brand-muted">Sem cliente</span>}</td>
                    <td><span className="rounded-full bg-brand-background px-2 py-1 text-xs font-semibold text-brand-primary">{STATUS_LABELS[session.status]}</span></td>
                    <td>{session.channel}</td>
                    <td>{itemCount(session.items)}</td>
                    <td>{formatCurrency(sessionTotal(session))}</td>
                    <td><Link href="/workspace/catalogo" className={adminUi.button}>Abrir no catálogo</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredSessions.length === 0 && <p className={`${adminUi.previewEmpty} mt-3`}>Nenhum pedido em andamento.</p>}
        </section>

        <section className="rounded-brand border border-[#eee] bg-white p-4">
          <div>
            <h2 className="font-bold">Pedidos concluídos</h2>
            <p className="mt-1 text-sm text-brand-muted">Histórico financeiro já finalizado.</p>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className={adminUi.table}>
              <thead><tr><th>Data</th><th>Cliente</th><th>Canal</th><th>Pagamento</th><th>Peças</th><th>Total</th><th /></tr></thead>
              <tbody>
                {filteredOrders.map((order) => {
                  const isExpanded = expandedId === order.id;
                  return (
                    <tr key={order.id}>
                      <td>{new Date(order.date).toLocaleString('pt-BR')}</td>
                      <td>{order.clientName || '—'}</td>
                      <td>{order.channel}</td>
                      <td>{order.paymentMethod || '—'}</td>
                      <td>{itemCount(order.items)}</td>
                      <td>{formatCurrency(order.total)}</td>
                      <td>
                        <button type="button" className={adminUi.button} onClick={() => setExpandedId(isExpanded ? null : order.id)}>{isExpanded ? 'Ocultar itens' : 'Ver itens'}</button>
                        {isExpanded && <div className="mt-2 min-w-56 text-xs text-brand-muted">{order.items.map((item) => <div key={item.key}>{item.qty}× {item.name}{item.color ? ` · ${item.color}` : ''}{item.size ? ` · ${item.size}` : ''}</div>)}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredOrders.length === 0 && <p className={`${adminUi.previewEmpty} mt-3`}>Nenhum pedido concluído.</p>}
        </section>
      </main>

      {isCreating && <CreateOrderModal onClose={() => setCreating(false)} onCreated={(session) => {
        setSessions((current) => [session, ...current]);
        setCreating(false);
      }} />}
    </div>
  );
}
