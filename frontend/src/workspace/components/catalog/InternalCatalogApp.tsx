'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { formatBRL } from '@/lib/format';
import { ADDABLE_AVAILABILITY, buildVariantMatrix } from '@/lib/variants';
import type { Product, Variant } from '@/domain/products/types';
import type { CartItem, OrderBook, OrderSession } from '@/domain/orders/types';
import { adminUi } from '@/workspace/lib/ui';
import {
  activateOrderBook,
  createOrderBook,
  fetchActiveOrderBook,
  fetchOrderBooks,
  fetchOrderSessions,
  updateOrderSession,
} from '@/workspace/lib/ordersClient';
import WorkspaceNav from '@/workspace/navigation/WorkspaceNav';
import { CreateOrderModal } from '@/workspace/orders/OrderTalaoModal';

function itemCount(items: CartItem[]) {
  return items.reduce((total, item) => total + item.qty, 0);
}

function sessionTotal(session: OrderSession) {
  return session.items.reduce((total, item) => total + item.price * item.qty, 0) + (session.shipping?.price || 0);
}

function SessionLabel({ session }: { session: OrderSession }) {
  return <span>{session.clientId ? session.clientName : 'Pedido sem cliente'} · {itemCount(session.items)} peças</span>;
}

export default function InternalCatalogApp({
  products,
  initialBooks,
  initialSessions,
}: {
  products: Product[];
  initialBooks: OrderBook[];
  initialSessions: OrderSession[];
}) {
  const [books, setBooks] = useState(initialBooks);
  const [sessions, setSessions] = useState(initialSessions);
  const [selectedBookId, setSelectedBookId] = useState(initialBooks.find((book) => book.isActive)?.id || '');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [search, setSearch] = useState('');
  const [isCreatingOrder, setCreatingOrder] = useState(false);
  const [isCreatingBook, setCreatingBook] = useState(false);
  const [bookName, setBookName] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [nextBooks, nextSessions] = await Promise.all([fetchOrderBooks(), fetchOrderSessions()]);
    setBooks(nextBooks);
    setSessions(nextSessions);
    setSelectedBookId((current) => current || nextBooks.find((book) => book.isActive)?.id || '');
  }, []);

  useEffect(() => {
    if (selectedBookId || books.length) return;
    fetchActiveOrderBook()
      .then((book) => {
        setBooks((current) => [book, ...current]);
        setSelectedBookId(book.id);
      })
      .catch(() => setMessage('Não foi possível abrir um talão agora.'));
  }, [books.length, selectedBookId]);

  useEffect(() => {
    const source = new EventSource('/api/sessions/stream');
    const sync = () => { void refresh().catch(() => {}); };
    source.addEventListener('sessions-updated', sync);
    source.addEventListener('order-books-updated', sync);
    return () => source.close();
  }, [refresh]);

  const activeBook = books.find((book) => book.id === selectedBookId) || null;
  const bookSessions = useMemo(
    () => sessions.filter((session) => session.orderBookId === selectedBookId && session.status !== 'fechado'),
    [sessions, selectedBookId],
  );
  const selectedSession = bookSessions.find((session) => session.id === selectedSessionId) || null;
  const filteredProducts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    if (!term) return products;
    return products.filter((product) => [product.name, product.sku, product.category, product.subcategory]
      .filter(Boolean).some((value) => value!.toLocaleLowerCase('pt-BR').includes(term)));
  }, [products, search]);

  async function selectBook(id: string) {
    setMessage(null);
    try {
      const active = await activateOrderBook(id);
      setBooks((current) => current.map((book) => ({ ...book, isActive: book.id === active.id })));
      setSelectedBookId(active.id);
      setSelectedSessionId(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível trocar o talão.');
    }
  }

  async function createBook() {
    if (!bookName.trim()) return;
    setSaving(true);
    try {
      const created = await createOrderBook(bookName.trim());
      setBooks((current) => [created, ...current.map((book) => ({ ...book, isActive: false }))]);
      setSelectedBookId(created.id);
      setSelectedSessionId(null);
      setBookName('');
      setCreatingBook(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível criar o talão.');
    } finally {
      setSaving(false);
    }
  }

  async function changeVariant(product: Product, variant: Variant, delta: number) {
    if (!selectedSession) {
      setMessage('Selecione um pedido atual antes de adicionar peças.');
      return;
    }
    if (!ADDABLE_AVAILABILITY.has(variant.availability)) return;
    const key = `${product.id}|${variant.color}|${variant.size}`;
    const existing = selectedSession.items.find((item) => item.key === key);
    const qty = Math.max(0, (existing?.qty || 0) + delta);
    const nextItems = qty === 0
      ? selectedSession.items.filter((item) => item.key !== key)
      : existing
        ? selectedSession.items.map((item) => item.key === key ? { ...item, qty } : item)
        : [...selectedSession.items, {
          key, id: product.id, name: product.name, image: product.image, color: variant.color, size: variant.size,
          price: variant.price ?? product.price, qty, stockQty: variant.stockQty,
          backorderDate: variant.availableFrom,
        }];
    setSaving(true);
    try {
      const updated = await updateOrderSession(selectedSession.id, { items: nextItems });
      setSessions((current) => current.map((session) => session.id === updated.id ? updated : session));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível atualizar o pedido.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={adminUi.catalogPage}>
      <header className={adminUi.topbar}>
        <div className={adminUi.topbarLeft}>
          <div><h1>Catálogo de atendimento</h1><p className="mt-1 text-sm text-brand-muted">Escolha as grades direto no catálogo para o pedido atual.</p></div>
          <WorkspaceNav />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Talão ativo" value={selectedBookId} onChange={(event) => void selectBook(event.target.value)} className="min-h-10 rounded-control border border-border bg-white px-3 text-sm">
            {books.map((book) => <option key={book.id} value={book.id}>{book.name}{book.isActive ? ' · ativo' : ''}</option>)}
          </select>
          <button type="button" className={adminUi.button} onClick={() => setCreatingBook(true)}>Novo talão</button>
          <button type="button" className={adminUi.primaryButton} disabled={!activeBook} onClick={() => setCreatingOrder(true)}>+ Pedido atual</button>
        </div>
      </header>

      <main className={`${adminUi.productsEditor} grid gap-5 xl:grid-cols-[17rem_minmax(0,1fr)_24rem]`}>
        <aside className="rounded-brand border border-border bg-white p-4">
          <div className="flex items-center justify-between gap-2"><h2 className="font-bold">Pedidos atuais</h2><span className="text-xs text-brand-muted">{bookSessions.length}</span></div>
          <p className="mt-1 text-xs text-brand-muted">Itens deste talão: {activeBook?.name || 'carregando'}.</p>
          <div className="mt-3 flex max-h-[62vh] flex-col gap-2 overflow-y-auto">
            {bookSessions.map((session) => (
              <button key={session.id} type="button" onClick={() => setSelectedSessionId(session.id)} className={`rounded-control border p-3 text-left text-sm transition ${selectedSessionId === session.id ? 'border-brand-primary bg-brand-background' : 'border-border hover:border-brand-primary/40'}`}>
                <strong className="block truncate">{session.clientName || 'Sem cliente'}</strong>
                <span className="mt-1 block text-xs text-brand-muted"><SessionLabel session={session} /></span>
                <span className="mt-1 block text-xs font-semibold text-brand-primary">{formatBRL(sessionTotal(session))}</span>
              </button>
            ))}
            {bookSessions.length === 0 && <p className="py-6 text-center text-sm text-brand-muted">Crie um pedido para começar.</p>}
          </div>
        </aside>

        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="font-bold">Peças</h2><p className="text-sm text-brand-muted">{selectedSession ? `Adicionando em: ${selectedSession.clientName}` : 'Selecione um pedido atual para incluir peças.'}</p></div>
            <input className="min-h-10 w-full rounded-control border border-border bg-white px-3 text-sm sm:w-72" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar peça, SKU ou categoria" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
            {filteredProducts.map((product) => (
              <article key={product.id} className={`group overflow-hidden rounded-brand border bg-white ${selectedProduct?.id === product.id ? 'border-brand-primary ring-1 ring-brand-primary/30' : 'border-border'}`}>
                <button type="button" onClick={() => setSelectedProduct(product)} className="block w-full text-left">
                  <img className="aspect-[9/12] w-full bg-brand-background object-cover" src={product.image || 'https://via.placeholder.com/400x520?text=Sem+imagem'} alt={product.name} />
                  <div className="p-3"><p className="text-[11px] text-brand-muted">{product.category}</p><h3 className="mt-1 min-h-10 text-sm font-semibold leading-5">{product.name}</h3><strong className="mt-2 block text-sm text-brand-primary">{formatBRL(product.price)}</strong></div>
                </button>
              </article>
            ))}
          </div>
        </section>

        <VariantPanel product={selectedProduct} session={selectedSession} saving={saving} onClose={() => setSelectedProduct(null)} onChange={changeVariant} />
      </main>

      {message && <div className="fixed right-5 bottom-5 z-50 rounded-control bg-brand-text px-4 py-3 text-sm text-white shadow-lg">{message}</div>}
      {isCreatingOrder && activeBook && <CreateOrderModal orderBookId={activeBook.id} onClose={() => setCreatingOrder(false)} onCreated={(session) => {
        setSessions((current) => [session, ...current]); setSelectedSessionId(session.id); setCreatingOrder(false);
      }} />}
      {isCreatingBook && <div className={adminUi.modalOverlay} role="dialog" aria-modal="true" aria-label="Novo talão"><section className={adminUi.modalPanel}><header className={adminUi.modalHeader}><h2 className="font-bold">Novo talão</h2><button type="button" className={adminUi.iconButton} onClick={() => setCreatingBook(false)}><X className="size-4" /></button></header><div className={adminUi.modalBody}><label className={adminUi.field}>Nome do talão<input autoFocus value={bookName} onChange={(event) => setBookName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void createBook(); }} placeholder="Ex.: Atendimento feira agosto" /></label></div><footer className={adminUi.modalFooter}><button type="button" className={adminUi.button} onClick={() => setCreatingBook(false)}>Cancelar</button><button type="button" className={adminUi.primaryButton} disabled={!bookName.trim() || saving} onClick={() => void createBook()}>{saving ? 'Criando...' : 'Criar e ativar'}</button></footer></section></div>}
    </div>
  );
}

function VariantPanel({ product, session, saving, onClose, onChange }: { product: Product | null; session: OrderSession | null; saving: boolean; onClose: () => void; onChange: (product: Product, variant: Variant, delta: number) => Promise<void> }) {
  if (!product) return <aside className="hidden rounded-brand border border-dashed border-border bg-white p-5 xl:block"><p className="text-sm text-brand-muted">Escolha uma peça para abrir a grade de cores e tamanhos aqui.</p></aside>;
  const matrix = buildVariantMatrix(product);
  const qtyFor = (variant: Variant) => session?.items.find((item) => item.key === `${product.id}|${variant.color}|${variant.size}`)?.qty || 0;
  return <aside className="rounded-brand border border-border bg-white p-4 xl:sticky xl:top-4 xl:h-fit"><div className="flex items-start justify-between gap-3"><div><h2 className="font-bold">{product.name}</h2><p className="mt-1 text-sm text-brand-primary">{formatBRL(product.price)}</p></div><button type="button" className={adminUi.iconButton} onClick={onClose} aria-label="Fechar grade"><X className="size-4" /></button></div><p className="mt-3 text-sm text-brand-muted">Selecione as quantidades por cor e tamanho. A atualização é compartilhada no talão em tempo real.</p>{!session && <p className="mt-3 rounded-control bg-brand-background p-3 text-sm text-brand-primary">Selecione um pedido atual primeiro.</p>}<div className="mt-4 overflow-x-auto"><table className="w-full min-w-[20rem] text-sm"><thead><tr><th className="p-2 text-left text-brand-muted">Cor</th>{matrix.sizes.map((size) => <th className="p-2 text-center text-brand-muted" key={size}>{size}</th>)}</tr></thead><tbody>{matrix.rows.map((row) => <tr key={row.color} className="border-t border-border"><th className="p-2 text-left text-xs">{row.color}</th>{row.cells.map((variant, index) => { const qty = variant ? qtyFor(variant) : 0; const disabled = !variant || !ADDABLE_AVAILABILITY.has(variant.availability) || !session || saving; return <td key={`${row.color}-${matrix.sizes[index]}`} className="p-1 text-center">{variant ? <div className="inline-flex items-center rounded-control border border-border"><button type="button" className="size-7 text-brand-muted disabled:opacity-30" disabled={disabled || qty === 0} onClick={() => void onChange(product, variant, -1)}>−</button><span className="w-6 text-center text-xs font-semibold">{qty}</span><button type="button" className="size-7 text-brand-primary disabled:opacity-30" disabled={disabled} onClick={() => void onChange(product, variant, 1)} aria-label={`Adicionar ${row.color} ${matrix.sizes[index]}`}>{qty > 0 ? <Plus className="mx-auto size-3" /> : <Check className="mx-auto size-3" />}</button></div> : <span className="text-brand-muted">—</span>}</td>; })}</tr>)}</tbody></table></div></aside>;
}
