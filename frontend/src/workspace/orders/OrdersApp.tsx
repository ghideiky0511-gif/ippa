'use client';
import { adminUi } from '@/workspace/lib/ui';
import WorkspaceNav from '@/workspace/navigation/WorkspaceNav';
import { useEffect, useMemo, useState } from 'react';
import type { Order } from '@/domain/orders/types';
import { fetchOrders } from '@/workspace/lib/ordersClient';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export default function OrdersApp({ initialOrders }: { initialOrders: Order[] }) {
  const [orders, setOrders] = useState(initialOrders);
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function refresh() {
    try {
      setOrders(await fetchOrders());
    } catch {
      // A lista já visível continua útil se uma atualização em segundo plano falhar.
    }
  }

  useEffect(() => {
    const source = new EventSource('/api/sessions/stream');
    source.addEventListener('orders-updated', refresh);
    return () => source.close();
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!normalizedQuery) return orders;
    return orders.filter((order) =>
      [order.id, order.clientName, order.paymentMethod, order.channel]
        .some((value) => value?.toLowerCase().includes(normalizedQuery)),
    );
  }, [orders, normalizedQuery]);

  return (
    <div>
      <div className={adminUi.topbar}>
        <div className={adminUi.topbarLeft}>
          <h1>Pedidos</h1>
          <WorkspaceNav />
        </div>
      </div>

      <main className={adminUi.productsEditor}>
        <div className={adminUi.field} style={{ maxWidth: 360 }}>
          <label>Buscar</label>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cliente, pagamento, canal ou ID..."
          />
        </div>

        <table className={adminUi.table}>
          <thead>
            <tr>
              <th>Data</th>
              <th>Cliente</th>
              <th>Canal</th>
              <th>Pagamento</th>
              <th>Itens</th>
              <th>Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {results.map((order) => {
              const totalItems = order.items.reduce((total, item) => total + item.qty, 0);
              const isExpanded = expandedId === order.id;
              return (
                <tr key={order.id}>
                  <td>{new Date(order.date).toLocaleString('pt-BR')}</td>
                  <td>{order.clientName || '—'}</td>
                  <td>{order.channel}</td>
                  <td>{order.paymentMethod || '—'}</td>
                  <td>{totalItems}</td>
                  <td>{formatCurrency(order.total)}</td>
                  <td>
                    <button
                      type="button"
                      className={adminUi.button}
                      onClick={() => setExpandedId(isExpanded ? null : order.id)}
                    >
                      {isExpanded ? 'Ocultar itens' : 'Ver itens'}
                    </button>
                    {isExpanded && (
                      <div className="mt-2 min-w-56 text-xs text-brand-muted">
                        {order.items.map((item) => (
                          <div key={item.key}>{item.qty}× {item.name}{item.color ? ` · ${item.color}` : ''}{item.size ? ` · ${item.size}` : ''}</div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {results.length === 0 && <p className={adminUi.previewEmpty}>Nenhum pedido encontrado.</p>}
      </main>
    </div>
  );
}
