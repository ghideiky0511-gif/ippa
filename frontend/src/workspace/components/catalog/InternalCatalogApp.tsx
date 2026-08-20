'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ClipboardList, Copy, Minus, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatBRL } from '@/lib/format';
import { ADDABLE_AVAILABILITY, buildVariantMatrix, deliveryLabel } from '@/lib/variants';
import { resolveGallery, resolveImageForColor } from '@/lib/images';
import { COLOR_MAP } from '@/lib/config';
import { publicUi } from '@/lib/ui';
import { enableImageCache } from '@/lib/image-cache';
import type { Product, Variant } from '@/domain/products/types';
import type { OrderBook, OrderSession } from '@/domain/orders/types';
import { adminUi } from '@/workspace/lib/ui';
import Link from '@/components/TenantLink';
import { useTenant } from '@/components/TenantProvider';
import { useSearchParams } from 'next/navigation';
import { pedidoRealtimeEventMessage, usePedidoRealtime, type PedidoParticipant, type PedidoPresence } from '@/lib/realtime/usePedidoRealtime';
import { useUpdatesRealtime } from '@/lib/realtime/useUpdatesRealtime';
import { OrderSessionPeopleWidget } from '@/components/OrderSessionPeopleWidget';
import CatalogProductCard from '@/components/CatalogProductCard';
import ProductImage from '@/components/ProductImage';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTrigger } from '@/components/ui/sheet';
import { HubHeader } from '@/workspace/components/shared/HubHeader';
import { OrderBookPanel } from './OrderBookPanel';
import {
  activateOrderBook,
  cancelOrderBook,
  createOrderBook,
  fetchActiveOrderBook,
  fetchOrderBooks,
  fetchOrderSessions,
  updateOrderSession,
} from '@/workspace/lib/ordersClient';
import { CreateOrderModal } from '@/workspace/orders/OrderTalaoModal';

function CatalogCard({ product, onOpen }: { product: Product; onOpen: () => void }) {
  return <CatalogProductCard
    product={product}
    onOpen={onOpen}
    title={<button type="button" onClick={onOpen} className="text-left hover:text-brand-primary">{product.name}</button>}
    price={<span className="text-base font-bold text-foreground">{formatBRL(product.price)}</span>}
  />;
}

function ShareCatalogSheet({ open, onOpenChange, publicPath }: { open: boolean; onOpenChange: (open: boolean) => void; publicPath: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const links = [
    { id: 'with-price', label: 'Catálogo público com preço', url: `${origin}${publicPath}` },
    { id: 'without-price', label: 'Catálogo público sem preço', url: `${origin}${publicPath}?precos=ocultos` },
  ];
  async function copy(id: string, url: string) {
    await navigator.clipboard.writeText(url);
    setCopied(id);
    window.setTimeout(() => setCopied(null), 1800);
  }
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent side="right" className="w-[min(100%,30rem)]"><SheetHeader><div><h2 className="font-bold">Link público do catálogo</h2><p className="mt-1 text-xs text-muted-foreground">Escolha a versão para compartilhar com a cliente.</p></div></SheetHeader><div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">{links.map((link) => <div key={link.id} className="rounded-brand border border-border bg-white p-4"><h3 className="text-sm font-semibold">{link.label}</h3><p className="mt-1 text-xs text-brand-muted">{link.id === 'with-price' ? 'Mostra os valores de venda.' : 'Mostra peças, cores e grades sem valores.'}</p><input readOnly value={link.url} onClick={(event) => event.currentTarget.select()} className="mt-3 w-full rounded-control border border-border bg-brand-background px-3 py-2 text-xs text-brand-muted" /><div className="mt-3 flex gap-2"><button type="button" className={`${adminUi.button} inline-flex items-center gap-2`} onClick={() => void copy(link.id, link.url)} disabled={!origin}>{copied === link.id ? <Check className="size-4" /> : <Copy className="size-4" />}{copied === link.id ? 'Copiado' : 'Copiar link'}</button><a className={`${adminUi.button} inline-flex items-center gap-2`} href={link.url} target="_blank" rel="noreferrer">Abrir</a></div></div>)}</div></SheetContent></Sheet>;
}

export default function InternalCatalogApp({ products, initialBooks, initialSessions }: { products: Product[]; initialBooks: OrderBook[]; initialSessions: OrderSession[] }) {
  const { href } = useTenant();
  const searchParams = useSearchParams();
  const requestedSessionId = searchParams.get('session');
  const initialRequestedSession = initialSessions.find((item) => item.id === requestedSessionId);
  const [books, setBooks] = useState(initialBooks);
  const [sessions, setSessions] = useState(initialSessions);
  const [selectedBookId, setSelectedBookId] = useState(initialRequestedSession?.orderBookId || initialBooks.find((book) => book.isActive)?.id || '');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(initialRequestedSession?.id || null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [search, setSearch] = useState('');
  const [isCreatingOrder, setCreatingOrder] = useState(false);

  useEffect(() => {
    enableImageCache();
  }, []);
  const [isCreatingBook, setCreatingBook] = useState(false);
  const [isSharing, setSharing] = useState(false);
  const [bookName, setBookName] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [presence, setPresence] = useState<PedidoPresence[]>([]);
  const [participants, setParticipants] = useState<PedidoParticipant[]>([]);
  const [sessionToCancel, setSessionToCancel] = useState<OrderSession | null>(null);
  const [bookToCancel, setBookToCancel] = useState<OrderBook | null>(null);
  const [isBookPanelOpen, setBookPanelOpen] = useState(false);

  const refresh = useCallback(async () => {
    const [nextBooks, nextSessions] = await Promise.all([fetchOrderBooks('aberto'), fetchOrderSessions()]);
    setBooks(nextBooks);
    setSessions(nextSessions);
    setSelectedBookId((current) => {
      // Um talão só pode ficar selecionado enquanto está aberto — não dá pra
      // reativá-lo depois de fechado (activateOrderBook rejeita). Se o talão
      // selecionado fechou (ex.: "Atendimentos online" some assim que a
      // última sessão dele termina), segue automaticamente pro novo talão
      // ativo da vendedora, senão o próximo atendimento online cai num talão
      // que nunca aparece na tela.
      const currentBook = nextBooks.find((book) => book.id === current);
      if (currentBook?.status === 'aberto') return current;
      return nextBooks.find((book) => book.isActive)?.id || current || '';
    });
  }, []);

  useEffect(() => {
    if (selectedBookId || books.length) return;
    fetchActiveOrderBook().then((book) => { setBooks((current) => [book, ...current]); setSelectedBookId(book.id); }).catch(() => setMessage('Não foi possível abrir um talão agora.'));
  }, [books.length, selectedBookId]);

  useUpdatesRealtime((update) => {
    if (update === 'sessions_updated' || update === 'order_books_updated') void refresh().catch(() => {});
  });

  const activeBook = books.find((book) => book.id === selectedBookId) || null;
  const bookSessions = useMemo(() => sessions.filter((session) => session.orderBookId === selectedBookId && (session.status === 'aberto' || session.status === 'aguardando_pagamento')), [sessions, selectedBookId]);
  const cancelledSessions = useMemo(() => sessions.filter((session) => session.orderBookId === selectedBookId && session.status === 'cancelado'), [sessions, selectedBookId]);
  const selectedSession = bookSessions.find((session) => session.id === selectedSessionId) || null;
  usePedidoRealtime({
    sessionId: selectedSession?.id,
    onSession: (updated) => setSessions((current) => current.map((session) => session.id === updated.id ? updated : session)),
    onPresence: setPresence,
    onParticipants: setParticipants,
    onEvent: (event) => toast.info(pedidoRealtimeEventMessage(event)),
  });
  const filteredProducts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    if (!term) return products;
    return products.filter((product) => [product.name, product.referenceId, product.category, product.subcategory].filter(Boolean).some((value) => value!.toLocaleLowerCase('pt-BR').includes(term)));
  }, [products, search]);

  async function selectBook(id: string) {
    try {
      const active = await activateOrderBook(id);
      setBooks((current) => current.map((book) => ({ ...book, isActive: book.id === active.id })));
      setSelectedBookId(active.id);
      setSelectedSessionId(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível trocar o talão.'); }
  }

  async function createBook() {
    if (!bookName.trim()) return;
    setSaving(true);
    try {
      const created = await createOrderBook(bookName.trim());
      setBooks((current) => [created, ...current.map((book) => ({ ...book, isActive: false }))]);
      setSelectedBookId(created.id); setSelectedSessionId(null); setBookName(''); setCreatingBook(false);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível criar o talão.'); } finally { setSaving(false); }
  }

  async function changeVariant(product: Product, variant: Variant, delta: number) {
    if (!selectedSession) { setMessage('Selecione um pedido atual antes de adicionar peças.'); return; }
    if (!ADDABLE_AVAILABILITY.has(variant.availability)) return;
    const key = `${product.id}|${variant.color}|${variant.size}`;
    const existing = selectedSession.items.find((item) => item.key === key);
    const qty = Math.max(0, (existing?.qty || 0) + delta);
    const nextItems = qty === 0 ? selectedSession.items.filter((item) => item.key !== key) : existing ? selectedSession.items.map((item) => item.key === key ? { ...item, qty } : item) : [...selectedSession.items, { key, id: product.id, name: product.name, image: product.image, color: variant.color, size: variant.size, price: variant.price ?? product.price, qty, stockQty: variant.stockQty, backorderDate: variant.availableFrom }];
    setSaving(true);
    try {
      const updated = await updateOrderSession(selectedSession.id, { items: nextItems });
      setSessions((current) => current.map((session) => session.id === updated.id ? updated : session));
    } catch (error) {
      // Sessão de upsell num pedido que já foi pago/cancelado em outro
      // talão (ver closeOpenOrderSessionRowsByOrder no backend): não
      // deveria mais acontecer, mas se acontecer o refresh() traz a lista
      // real de volta em vez de deixar a vendedora presa numa sessão morta.
      if (error instanceof Error && error.message === 'ORDER_ALREADY_FINALIZED') {
        setMessage('Este pedido já foi finalizado em outro talão. Atualizando a lista...');
        void refresh();
      } else {
        setMessage(error instanceof Error ? error.message : 'Não foi possível atualizar o pedido.');
      }
    } finally { setSaving(false); }
  }

  async function cancelBook(book: OrderBook) {
    setSaving(true);
    setMessage(null);
    try {
      const cancelled = await cancelOrderBook(book.id);
      setBooks((current) => current.map((item) => item.id === cancelled.id ? cancelled : item));
      setSelectedSessionId(null);
      setSelectedProduct(null);
      setMessage('Talão cancelado. Os pedidos vazios foram cancelados.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível cancelar o talão.');
    } finally {
      setSaving(false);
    }
  }

  async function setSessionStatus(session: OrderSession, status: 'aberto' | 'cancelado') {
    setSaving(true);
    setMessage(null);
    try {
      const updated = await updateOrderSession(session.id, { status });
      setSessions((current) => current.map((item) => item.id === updated.id ? updated : item));
      if (status === 'aberto') {
        setSelectedSessionId(updated.id);
        setMessage('Pedido reativado e devolvido ao talão.');
      } else {
        setSelectedSessionId((current) => current === updated.id ? null : current);
        setSelectedProduct(null);
        setMessage('Pedido cancelado. Ele foi preservado e pode ser reativado.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível atualizar o pedido.');
    } finally {
      setSaving(false);
    }
  }

  function cancelSession(session: OrderSession) {
    setSessionToCancel(session);
  }

  const orderBookPanelProps = {
    activeBook,
    bookSessions,
    cancelledSessions,
    selectedSessionId,
    onSelectSession: (id: string) => { setSelectedSessionId(id); setBookPanelOpen(false); },
    saving,
    onCreateOrder: () => { setCreatingOrder(true); setBookPanelOpen(false); },
    onCancelBook: () => setBookToCancel(activeBook),
    onCancelSession: cancelSession,
    onReactivateSession: (session: OrderSession) => void setSessionStatus(session, 'aberto'),
  };

  return <div className={adminUi.catalogPage}>
    <HubHeader
      title="Catálogo de atendimento"
      description="Escolha uma peça para abrir a grade no painel lateral."
      primaryAction={{ label: 'Criar pedido', icon: <Plus className="mr-1 size-4" />, disabled: !activeBook || activeBook.status !== 'aberto', onClick: () => setCreatingOrder(true) }}
      secondaryActions={<>
        <Link href="/workspace" className={`${adminUi.button} inline-flex items-center gap-2`}><ArrowLeft className="size-4" />Voltar ao workspace</Link>
        <button type="button" className={`${adminUi.button} inline-flex items-center gap-2`} onClick={() => setSharing(true)}><Copy className="size-4" />Gerar link público</button>
        <select aria-label="Talão atual" value={selectedBookId} onChange={(event) => void selectBook(event.target.value)} className="min-h-10 rounded-control border border-border bg-white px-3 text-sm">{books.map((book) => <option key={book.id} value={book.id}>{book.name}{book.isActive ? ' · atual' : ''}</option>)}</select>
        <button type="button" className={adminUi.button} onClick={() => setCreatingBook(true)}>Novo talão</button>
        <Sheet open={isBookPanelOpen} onOpenChange={setBookPanelOpen}>
          <SheetTrigger asChild>
            <button type="button" className={`${adminUi.button} inline-flex items-center gap-2 xl:hidden`}>
              <ClipboardList className="size-4" />Talão{bookSessions.length > 0 ? ` · ${bookSessions.length}` : ''}
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[min(100%,24rem)]">
            <SheetHeader><h2 className="font-bold">Talão de atendimento</h2></SheetHeader>
            <div className="flex-1 overflow-y-auto p-4">
              <OrderBookPanel {...orderBookPanelProps} />
            </div>
          </SheetContent>
        </Sheet>
      </>}
    />

    <main className="grid gap-6 px-4 py-5 xl:grid-cols-[18rem_minmax(0,1fr)] sm:px-5">
      <aside className="hidden h-fit rounded-brand border border-border bg-white p-4 xl:sticky xl:top-4 xl:block">
        <OrderBookPanel {...orderBookPanelProps} />
      </aside>

      <section className="min-w-0"><div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-bold">Peças</h2><p className="mt-1 text-sm text-brand-muted">{selectedSession ? `Adicionando em: ${selectedSession.clientName || 'pedido sem cliente'}` : 'Selecione ou crie um pedido para adicionar peças.'}</p>{selectedSession && presence.length > 0 && <p className="mt-1 text-xs text-brand-muted">{presence.length === 1 ? 'Somente você está neste pedido.' : `${presence.length} pessoas estão acompanhando este pedido agora.`}</p>}</div><input className={publicUi.search} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar peça, SKU ou categoria" /></div><div className={publicUi.grid}>{filteredProducts.map((product) => <CatalogCard key={product.id} product={product} onOpen={() => setSelectedProduct(product)} />)}</div>{filteredProducts.length === 0 && <p className="py-12 text-center text-sm text-brand-muted">Nenhuma peça encontrada.</p>}</section>
    </main>
    {selectedSession && <OrderSessionPeopleWidget presence={presence} participants={participants} className="fixed top-20 right-5 z-50" />}

    <ProductSheet product={selectedProduct} session={selectedSession} saving={saving} onClose={() => setSelectedProduct(null)} onChange={changeVariant} />
    <ConfirmDialog open={!!sessionToCancel} onOpenChange={(open) => !open && setSessionToCancel(null)} title="Cancelar pedido?" description={`O pedido de ${sessionToCancel?.clientName || 'sem cliente'} continuará disponível para reativação.`} confirmLabel="Cancelar pedido" destructive onConfirm={() => sessionToCancel ? setSessionStatus(sessionToCancel, 'cancelado') : undefined} />
    <ConfirmDialog open={!!bookToCancel} onOpenChange={(open) => !open && setBookToCancel(null)} title="Cancelar talão?" description="Os pedidos pendentes e vazios deste talão serão cancelados. Pedidos já finalizados permanecem no histórico. Se algum pedido pendente tiver peças, o cancelamento não será permitido." confirmLabel="Cancelar talão" destructive onConfirm={() => bookToCancel ? cancelBook(bookToCancel) : undefined} />
    <ShareCatalogSheet open={isSharing} onOpenChange={setSharing} publicPath={href('/catalogo')} />
    {message && <div className="fixed right-5 bottom-5 z-[90] rounded-control bg-brand-text px-4 py-3 text-sm text-white shadow-lg">{message}</div>}
    {isCreatingOrder && activeBook && <CreateOrderModal orderBookId={activeBook.id} onClose={() => setCreatingOrder(false)} onCreated={(session) => { setSessions((current) => [session, ...current]); setSelectedSessionId(session.id); setCreatingOrder(false); }} />}
    {isCreatingBook && <div className={adminUi.modalOverlay} role="dialog" aria-modal="true" aria-label="Novo talão"><section className={adminUi.modalPanel}><header className={adminUi.modalHeader}><h2 className="font-bold">Novo talão</h2><button type="button" className={adminUi.iconButton} onClick={() => setCreatingBook(false)} aria-label="Fechar"><X className="size-4" aria-hidden="true" /></button></header><div className={adminUi.modalBody}><label className={adminUi.field}>Nome do talão<input autoFocus value={bookName} onChange={(event) => setBookName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void createBook(); }} placeholder="Ex.: Atendimento feira agosto" /></label></div><footer className={adminUi.modalFooter}><button type="button" className={adminUi.button} onClick={() => setCreatingBook(false)}>Cancelar</button><button type="button" className={adminUi.primaryButton} disabled={!bookName.trim() || saving} onClick={() => void createBook()}>{saving ? 'Criando...' : 'Criar e ativar'}</button></footer></section></div>}
  </div>;
}

function ProductSheet({ product, session, saving, onClose, onChange }: { product: Product | null; session: OrderSession | null; saving: boolean; onClose: () => void; onChange: (product: Product, variant: Variant, delta: number) => Promise<void> }) {
  const matrix = useMemo(() => product ? buildVariantMatrix(product) : null, [product]);
  const [colorOverride, setColor] = useState<string | null>(null);
  if (!product || !matrix) return null;
  const selectedColor = colorOverride && matrix.colors.includes(colorOverride) ? colorOverride : matrix.availableColors[0] || matrix.colors[0] || null;
  const color = selectedColor;
  const gallery = resolveGallery(product);
  const image = resolveImageForColor(product, selectedColor) || gallery[0] || product.image;
  const qtyFor = (variant: Variant) => session?.items.find((item) => item.key === `${product.id}|${variant.color}|${variant.size}`)?.qty || 0;
  return <Sheet open={!!product} onOpenChange={(open) => !open && onClose()}><SheetContent side="right" className="w-[min(100%,34rem)]"><SheetHeader><div className="min-w-0"><p className="text-xs font-semibold text-brand-primary">{product.category}</p><h2 className="truncate font-bold">{product.name}</h2></div></SheetHeader><div className="flex-1 overflow-y-auto p-5"><ProductImage className="aspect-[9/16] w-full rounded-brand bg-brand-background" src={image} alt={product.name} /><div className="mt-5 flex items-start justify-between gap-3"><div><h3 className="text-lg font-bold">{product.name}</h3>{product.referenceId && <p className="mt-1 text-xs text-brand-muted">{product.referenceId}</p>}</div><strong className="shrink-0 text-lg text-brand-primary">{formatBRL(product.price)}</strong></div>{product.description && <p className="mt-3 text-sm text-brand-muted">{product.description}</p>}<div className="mt-5"><p className="text-sm font-semibold">Cor {color ? `— ${color}` : ''}</p><div className="mt-2 flex flex-wrap gap-2">{matrix.colors.map((entry) => <button key={entry} type="button" aria-label={`Ver ${entry}`} onClick={() => setColor(entry)} className={`size-8 rounded-full border-2 ${color === entry ? 'border-brand-primary ring-2 ring-brand-primary/20' : 'border-white shadow-sm'}`} style={{ background: COLOR_MAP[entry] || '#ccc' }} />)}</div></div>{!session && <div className="mt-5 rounded-control border border-dashed border-brand-primary/40 bg-brand-background p-3 text-sm text-brand-primary">Selecione ou crie um pedido no talão para incluir estas peças.</div>}<div className="mt-5 overflow-x-auto"><table className="w-full min-w-[27rem] text-sm"><thead><tr className="border-b border-border"><th className="p-2 text-left text-xs text-brand-muted">Cor</th>{matrix.sizes.map((size) => <th key={size} className="p-2 text-center text-xs text-brand-muted">{size}</th>)}</tr></thead><tbody>{matrix.rows.filter((row) => !color || row.color === color).map((row) => <tr key={row.color} className="border-b border-border"><th className="p-2 text-left text-xs"><span className="mr-2 inline-block size-3 rounded-full border border-black/15 align-middle" style={{ background: COLOR_MAP[row.color] || '#ccc' }} />{row.color}</th>{row.cells.map((variant, index) => { const qty = variant ? qtyFor(variant) : 0; const disabled = !variant || !ADDABLE_AVAILABILITY.has(variant.availability) || !session || saving; return <td key={`${row.color}-${matrix.sizes[index]}`} className="p-1 text-center">{variant ? <div title={deliveryLabel(variant.availability)} className="inline-flex items-center rounded-control border border-border bg-white"><button type="button" className="flex size-8 items-center justify-center text-brand-muted disabled:opacity-30" disabled={disabled || qty === 0} onClick={() => void onChange(product, variant, -1)}><Minus className="size-3" /></button><span className="w-6 text-center text-xs font-semibold">{qty}</span><button type="button" className="flex size-8 items-center justify-center text-brand-primary disabled:opacity-30" disabled={disabled} onClick={() => void onChange(product, variant, 1)}><Plus className="size-3" /></button></div> : <span className="text-brand-muted">—</span>}</td>; })}</tr>)}</tbody></table></div><p className="mt-4 text-xs text-brand-muted">As alterações da grade são atualizadas em tempo real para quem estiver neste talão.</p></div></SheetContent></Sheet>;
}
