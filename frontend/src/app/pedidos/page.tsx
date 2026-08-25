'use client';
import { publicUi } from '@/lib/ui';
import ProductImage from '@/components/ProductImage';

import { useEffect, useState } from 'react';
import { ArrowLeft, UserRound } from 'lucide-react';
import Link from '@/components/TenantLink';
import { formatBRL } from '@/lib/format';
import { useAuthUser } from '@/components/AuthProvider';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonList } from '@/components/ui/skeleton';
import { z } from 'zod';
import { OrderSchema, type CartItem, type Order } from '@/domain/orders/types';
import { ProductSchema, type Product } from '@/domain/products/types';
import { useUpdatesRealtime } from '@/lib/realtime/useUpdatesRealtime';

const OrdersSchema = z.array(OrderSchema);
const ProductsSchema = z.array(ProductSchema);

// Pedido de atacado pode ter dezenas de linhas (peça×cor×tamanho) — listar
// item a item deixaria o card gigante. Resume por categoria (peças, qty e
// subtotal por categoria — mesmo campo Product.category do catálogo, ver
// types.ts) e só mostra a lista completa se a pessoa pedir (botão
// "ver itens"), igual o resto do catálogo já esconde detalhe atrás de um
// clique (quick-view) em vez de espalhar tudo na tela.
interface CategorySummary {
  category: string;
  qty: number;
  total: number;
}

function summarizeByCategory(items: CartItem[], catalogById: Record<string, Product>): CategorySummary[] {
  const byCategory = new Map<string, CategorySummary>();
  for (const item of items) {
    const category = catalogById[item.id]?.category || 'Outros';
    const entry = byCategory.get(category) || { category, qty: 0, total: 0 };
    entry.qty += item.qty;
    entry.total += item.qty * item.price;
    byCategory.set(category, entry);
  }
  return Array.from(byCategory.values()).sort((a, b) => b.qty - a.qty);
}

export default function PedidosPage() {
  const { authUser } = useAuthUser();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [catalogById, setCatalogById] = useState<Record<string, Product>>({});
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const isVendedora = authUser?.role === 'vendedora';

  useEffect(() => {
    if (!authUser) return;
    fetch('/api/orders')
      .then((r) => (r.ok ? r.json() : []))
      .then((json) => {
        const parsed = OrdersSchema.safeParse(json);
        setOrders(parsed.success ? parsed.data : []);
      })
      .catch(() => setOrders([]));
  }, [authUser]);

  // O socket de atualizações só sinaliza a mudança; a API refaz a consulta
  // limitada à conta autenticada, sem expor pedidos de outras pessoas.
  useUpdatesRealtime((update) => {
    if (!authUser || update !== 'orders_updated') return;
    void fetch('/api/orders', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((json) => {
        const parsed = OrdersSchema.safeParse(json);
        setOrders(parsed.success ? parsed.data : []);
      })
      .catch(() => {});
  });

  // Só pra resolver a categoria de cada item (CartItem não guarda categoria,
  // só o Product completo tem — ver types.ts). Mesmo fetch que CartProvider
  // já faz, mas essa página não está necessariamente dentro de um carrinho
  // ativo pra reaproveitar o catalogById dele.
  useEffect(() => {
    fetch('/api/catalog')
      .then((r) => (r.ok ? r.json() : []))
      .then((json) => {
        const parsed = ProductsSchema.safeParse(json);
        const products = parsed.success ? parsed.data : [];
        setCatalogById(Object.fromEntries(products.map((p) => [p.id, p])));
      })
      .catch(() => {});
  }, []);

  function toggleExpanded(orderId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  // Sem login não existe "meus pedidos" — pedido é sempre da conta agora
  // (ver GET /api/orders), não mais um histórico solto por navegador.
  if (!authUser) {
    return (
      <main className={`${publicUi.container} py-8 sm:py-10`}>
        <h1 className="mb-5 text-2xl font-bold tracking-[-0.03em] text-foreground sm:text-3xl">Meus pedidos</h1>
        <EmptyState
          title="Acesse seus pedidos"
          description="Entre ou crie uma conta para acompanhar seus pedidos em qualquer dispositivo."
          icon={<UserRound className="size-7" aria-hidden="true" />}
          action={
            <div className="mx-auto flex w-full max-w-[360px] flex-col gap-2.5">
              <Button asChild className="w-full">
                <Link href="/login">Entrar</Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link href="/cadastro">Criar conta</Link>
              </Button>
            </div>
          }
        />
        <Link href="/" className={publicUi.backLink}><ArrowLeft className="size-4" aria-hidden="true" />Voltar ao catálogo</Link>
      </main>
    );
  }

  return (
    <main className={`${publicUi.container} py-8 pb-14 sm:py-10`}>
      <h1>{isVendedora ? 'Minhas vendas' : 'Meus pedidos'}</h1>
      <p className="contents">
        {isVendedora
          ? 'Vendas suas fechadas pela cliente através do link de pagamento (ver talão).'
          : 'Pedidos da sua conta — valem em qualquer navegador ou aparelho que você usar pra entrar.'}
      </p>

      {orders === null && <SkeletonList count={3} itemClassName="rounded-brand" />}
      {orders !== null && orders.length === 0 && (
        <p className={publicUi.empty}>{isVendedora ? 'Nenhuma venda fechada ainda.' : 'Nenhum pedido enviado ainda.'}</p>
      )}

      <div className={publicUi.ordersList}>
        {orders?.map((order) => {
          const totalQty = order.items.reduce((sum, item) => sum + item.qty, 0);
          const categories = summarizeByCategory(order.items, catalogById);
          const isExpanded = expandedIds.has(order.id);
          return (
            <div className={publicUi.orderCard} key={order.id}>
              <div className={publicUi.orderCardHeader}>
                <span>
                  {new Date(order.date).toLocaleString('pt-BR')}
                  <span className="contents">
                    {order.channel === 'online'
                      ? 'via site'
                      : order.channel === 'whatsapp'
                        ? 'via WhatsApp'
                        : 'presencial'}
                  </span>
                </span>
                <span className="contents">{formatBRL(order.total)}</span>
              </div>
              {isVendedora && order.clientName && <div className="contents"><span>Cliente: {order.clientName}</span></div>}
              {(order.shipping || order.paymentMethod || order.discount) && (
                <div className="contents">
                  {order.shipping && <span>Frete: {order.shipping.label}</span>}
                  {order.paymentMethod && <span>Pagamento: {order.paymentMethod}</span>}
                  {order.discount && (
                    <span className="contents">
                      Desconto: {order.discount.label} (-{formatBRL(order.discount.amount)})
                    </span>
                  )}
                </div>
              )}

              <div className="contents">
                {categories.map((c) => (
                  <div className="contents" key={c.category}>
                    <span className="contents">{c.category}</span>
                    <span className="contents">{c.qty} peça{c.qty === 1 ? '' : 's'}</span>
                    <span className="contents">{formatBRL(c.total)}</span>
                  </div>
                ))}
              </div>

              <button type="button" className="contents" onClick={() => toggleExpanded(order.id)}>
                {isExpanded
                  ? 'Ocultar itens ▲'
                  : `Ver ${totalQty} peça${totalQty === 1 ? '' : 's'} · ${order.items.length} item${order.items.length === 1 ? '' : 'ns'} ▼`}
              </button>

              {isExpanded && (
                <div className={publicUi.orderItems}>
                  {order.items.map((item) => (
                    <div className={publicUi.orderItem} key={item.key}>
                      <ProductImage src={item.image} alt={item.name} className={publicUi.orderItemImage} />
                      <div>
                        <div className="contents">{item.name}</div>
                        <div className="contents">
                          {[item.color, item.size].filter(Boolean).join(' · ')} — {item.qty}x {formatBRL(item.price)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Link href="/" className={publicUi.backLink}><ArrowLeft className="size-4" aria-hidden="true" />Voltar ao catálogo</Link>
    </main>
  );
}
