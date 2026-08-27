'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { Client } from '@/domain/clients/types';
import { documentDigits } from '@/lib/document';
import type { CartItem, Order, OrderChannel, OrderSession } from '@/domain/orders/types';
import type { Product } from '@/domain/products/types';
import { adminUi } from '@/workspace/lib/ui';
import {
  createOrderSession,
  finalizeOrderSession,
  lookupOrderClientByDocument,
  searchOrderClients,
  updateOrderSession,
} from '@/lib/ordersClient';
import { useUpdatesRealtime } from '@/lib/realtime/useUpdatesRealtime';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function sessionTotal(session: Pick<OrderSession, 'items' | 'freight'>) {
  return session.items.reduce((sum, item) => sum + item.price * item.qty, 0) + (session.freight?.price ?? 0);
}

function cartItemFromProduct(product: Product): CartItem {
  const variant = product.variants.find((item) => item.availability !== 'out_of_stock') ?? product.variants[0];
  return {
    key: `${product.id}:${variant?.id ?? 'base'}`,
    id: product.id,
    name: product.name,
    image: product.image,
    color: variant?.color,
    size: variant?.size,
    price: variant?.price ?? product.price,
    qty: 1,
    stockQty: variant?.stockQty,
  };
}

function ClientLookup({
  onSelect,
  selected,
}: {
  onSelect: (client: Client) => void;
  selected?: Client | null;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    const value = query.trim();
    if (!value) return;
    setLoading(true);
    setError(null);
    try {
      const digits = documentDigits(value);
      if (digits.length === 11 || digits.length === 14) {
        // CPF/CNPJ exato: local primeiro, e se não existir o backend tenta
        // importar do ERP ativo antes de dizer que não encontrou.
        const result = await lookupOrderClientByDocument(digits);
        setResults(result.client ? [result.client] : []);
        if (!result.client) setError('Cliente não encontrada — cadastre manualmente.');
      } else {
        setResults(await searchOrderClients(value));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível buscar a cliente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-[#eee] bg-[#fafafa] p-3">
      <div className="flex flex-wrap gap-2">
        <div className={`${adminUi.field} min-w-[190px] flex-1`}>
          <label>CPF/CNPJ da cliente (opcional)</label>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void search();
              }
            }}
            placeholder="Digite para localizar"
          />
        </div>
        <button type="button" className={`${adminUi.button} self-end`} onClick={() => void search()} disabled={loading || !query.trim()}>
          {loading ? 'Buscando...' : 'Buscar'}
        </button>
      </div>

      {selected && <p className="mt-2 text-sm text-brand-text">Cliente vinculada: <strong>{selected.name}</strong>{selected.cpfCnpj ? ` · ${selected.cpfCnpj}` : ''}</p>}
      {error && <p className="mt-2 text-sm text-[#b00020]">{error}</p>}
      {results.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {results.map((client) => (
            <button
              key={client.id}
              type="button"
              className="rounded-md px-2 py-2 text-left text-sm hover:bg-white"
              onClick={() => {
                onSelect(client);
                setResults([]);
              }}
            >
              <strong>{client.name}</strong>{client.cpfCnpj ? ` · ${client.cpfCnpj}` : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CreateOrderModal({
  onClose,
  onCreated,
  orderBookId,
}: {
  onClose: () => void;
  onCreated: (session: OrderSession) => void;
  orderBookId?: string;
}) {
  const [client, setClient] = useState<Client | null>(null);
  const [reference, setReference] = useState('');
  const [channel, setChannel] = useState<OrderChannel>('presencial');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function create() {
    setSaving(true);
    setError(null);
    try {
      const session = await createOrderSession({
        orderBookId,
        clientId: client?.id,
        clientName: reference.trim() || undefined,
        channel,
      });
      onCreated(session);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar o pedido.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={adminUi.modalOverlay} role="dialog" aria-modal="true" aria-label="Criar pedido">
      <section className={adminUi.modalPanel}>
        <header className={adminUi.modalHeader}>
          <div>
            <h2 className="font-bold">Criar pedido</h2>
            <p className="mt-1 text-sm text-brand-muted">O cliente pode ser vinculado depois; ele será obrigatório apenas para finalizar.</p>
          </div>
          <button type="button" className={adminUi.iconButton} onClick={onClose} aria-label="Fechar"><X className="size-4" aria-hidden="true" /></button>
        </header>
        <div className={`${adminUi.modalBody} flex flex-col gap-4`}>
          <ClientLookup selected={client} onSelect={setClient} />
          <div className={adminUi.field}>
            <label>Referência do pedido (opcional)</label>
            <input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Ex.: atendimento da manhã" />
          </div>
          <div className={adminUi.field}>
            <label>Canal</label>
            <select value={channel} onChange={(event) => setChannel(event.target.value as OrderChannel)}>
              <option value="presencial">Presencial</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="online">Online</option>
            </select>
          </div>
          {error && <p className="text-sm text-[#b00020]">{error}</p>}
        </div>
        <footer className={adminUi.modalFooter}>
          <button type="button" className={adminUi.button} onClick={onClose}>Cancelar</button>
          <button type="button" className={adminUi.primaryButton} onClick={() => void create()} disabled={saving}>
            {saving ? 'Criando...' : client ? 'Criar com cliente' : 'Criar sem cliente'}
          </button>
        </footer>
      </section>
    </div>
  );
}

export function OrderTalaoModal({
  session,
  products,
  onClose,
  onRefresh,
  onUpdated,
  onFinalized,
}: {
  session: OrderSession;
  products: Product[];
  onClose: () => void;
  onRefresh: () => void;
  onUpdated: (session: OrderSession) => void;
  onFinalized: (order: Order) => void;
}) {
  const [items, setItems] = useState<CartItem[]>(session.items);
  const [client, setClient] = useState<Client | null>(session.clientId ? { id: session.clientId, name: session.clientName, createdAt: '', updatedAt: '' } : null);
  const [productQuery, setProductQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useUpdatesRealtime((update) => {
    if (update === 'sessions_updated') onRefresh();
  });

  const productResults = useMemo(() => {
    const query = productQuery.trim().toLowerCase();
    if (!query) return [];
    return products.filter((product) => product.name.toLowerCase().includes(query)).slice(0, 8);
  }, [products, productQuery]);

  const total = sessionTotal({ items, freight: session.freight });
  const canFinalize = Boolean(client?.id) && items.some((item) => item.qty > 0) && session.status !== 'fechado';

  function addProduct(product: Product) {
    const next = cartItemFromProduct(product);
    setItems((current) => {
      const existing = current.find((item) => item.key === next.key);
      return existing
        ? current.map((item) => item.key === next.key ? { ...item, qty: item.qty + 1 } : item)
        : [...current, next];
    });
    setProductQuery('');
  }

  function changeQuantity(key: string, amount: number) {
    setItems((current) => current
      .map((item) => item.key === key ? { ...item, qty: item.qty + amount } : item)
      .filter((item) => item.qty > 0));
  }

  async function save(clientId = client?.id) {
    setSaving(true);
    setMessage(null);
    try {
      const updated = await updateOrderSession(session.id, { items, clientId });
      onUpdated(updated);
      setMessage('Talão salvo.');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Não foi possível salvar o talão.');
    } finally {
      setSaving(false);
    }
  }

  async function linkClient(nextClient: Client) {
    setClient(nextClient);
    setSaving(true);
    setMessage(null);
    try {
      const updated = await updateOrderSession(session.id, { clientId: nextClient.id });
      onUpdated(updated);
      setMessage('Cliente vinculada ao pedido.');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Não foi possível vincular a cliente.');
    } finally {
      setSaving(false);
    }
  }

  async function finalize() {
    if (!client?.id) {
      setMessage('Vincule uma cliente antes de finalizar o pedido.');
      return;
    }
    if (!items.some((item) => item.qty > 0)) {
      setMessage('Adicione pelo menos uma peça antes de finalizar.');
      return;
    }
    setFinalizing(true);
    setMessage(null);
    try {
      const order = await finalizeOrderSession(session.id);
      onFinalized(order);
      onClose();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Não foi possível finalizar o pedido.');
    } finally {
      setFinalizing(false);
    }
  }

  return (
    <div className={adminUi.modalOverlay} role="dialog" aria-modal="true" aria-label="Talão de pedido">
      <section className={`${adminUi.modalPanel} max-w-3xl`}>
        <header className={adminUi.modalHeader}>
          <div>
            <h2 className="font-bold">Talão de pedido</h2>
            <p className="mt-1 text-sm text-brand-muted">{session.status === 'fechado' ? 'Pedido finalizado' : 'Sincronizado em tempo real'} · {session.channel}</p>
          </div>
          <button type="button" className={adminUi.iconButton} onClick={onClose} aria-label="Fechar"><X className="size-4" aria-hidden="true" /></button>
        </header>
        <div className={`${adminUi.modalBody} flex flex-col gap-5`}>
          {session.status !== 'fechado' && <ClientLookup selected={client} onSelect={(nextClient) => void linkClient(nextClient)} />}

          <section>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="font-semibold">Peças</h3>
              <span className="text-sm font-semibold">{formatCurrency(total)}</span>
            </div>
            {session.status !== 'fechado' && (
              <div className={`${adminUi.field} mb-2`}>
                <label>Adicionar peça</label>
                <input value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Buscar no catálogo..." />
              </div>
            )}
            {productResults.length > 0 && (
              <div className="mb-3 rounded-lg border border-[#eee] bg-white p-1">
                {productResults.map((product) => (
                  <button key={product.id} type="button" className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-brand-background" onClick={() => addProduct(product)}>
                    <span>{product.name}</span><span className="text-brand-muted">{formatCurrency(product.price)}</span>
                  </button>
                ))}
              </div>
            )}
            {items.length === 0 ? <p className={adminUi.previewEmpty}>Nenhuma peça adicionada.</p> : (
              <div className="flex flex-col gap-2">
                {items.map((item) => (
                  <div key={item.key} className="flex flex-wrap items-center gap-3 rounded-lg border border-[#eee] p-3 text-sm">
                    <div className="min-w-40 flex-1"><strong>{item.name}</strong><div className="text-xs text-brand-muted">{[item.color, item.size].filter(Boolean).join(' · ')}</div></div>
                    <span>{formatCurrency(item.price)}</span>
                    {session.status === 'fechado' ? <span>× {item.qty}</span> : (
                      <div className="flex items-center gap-1">
                        <button type="button" className={adminUi.button} onClick={() => changeQuantity(item.key, -1)}>−</button>
                        <span className="min-w-5 text-center">{item.qty}</span>
                        <button type="button" className={adminUi.button} onClick={() => changeQuantity(item.key, 1)}>+</button>
                      </div>
                    )}
                    <strong>{formatCurrency(item.price * item.qty)}</strong>
                  </div>
                ))}
              </div>
            )}
          </section>

          {message && <p className={`text-sm ${message.includes('salvo') || message.includes('vinculada') ? 'text-[#237a45]' : 'text-[#b00020]'}`}>{message}</p>}
        </div>
        <footer className={adminUi.modalFooter}>
          <button type="button" className={adminUi.button} onClick={onClose}>Fechar</button>
          {session.status !== 'fechado' && (
            <>
              <button type="button" className={adminUi.button} onClick={() => void save()} disabled={saving || finalizing}>{saving ? 'Salvando...' : 'Salvar peças'}</button>
              <span className="text-xs text-brand-muted">Cobrança pelo app em breve — combine o pagamento direto com a cliente.</span>
              <button type="button" className={adminUi.primaryButton} onClick={() => void finalize()} disabled={!canFinalize || finalizing || saving}>
                {finalizing ? 'Finalizando...' : 'Finalizar pedido'}
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}
