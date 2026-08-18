'use client';
import { publicUi } from '@/lib/ui';

import { useEffect, useState } from 'react';
import Link from '@/components/TenantLink';
import { formatBRL } from '@/lib/format';
import { useAuthUser } from '@/components/AuthProvider';
import type { CartItem, Order } from '@/domain/orders/types';
import type { Product } from '@/domain/products/types';

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
      .then(setOrders)
      .catch(() => setOrders([]));
  }, [authUser]);

  // Só pra resolver a categoria de cada item (CartItem não guarda categoria,
  // só o Product completo tem — ver types.ts). Mesmo fetch que CartProvider
  // já faz, mas essa página não está necessariamente dentro de um carrinho
  // ativo pra reaproveitar o catalogById dele.
  useEffect(() => {
    fetch('/api/catalog')
      .then((r) => (r.ok ? r.json() : []))
      .then((products: Product[]) => setCatalogById(Object.fromEntries(products.map((p) => [p.id, p]))))
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
      <main className="contents">
        <h1>Meus pedidos</h1>
        <div className={publicUi.empty}>
          Entre ou crie uma conta pra ver seus pedidos.
          <div className={publicUi.checkoutActions}>
            <Link href="/login" className={publicUi.primaryButton}>Entrar</Link>
            <Link href="/cadastro" className={publicUi.primaryButton}>Criar conta</Link>
          </div>
        </div>
        <Link href="/" className={publicUi.backLink}>← Voltar ao catálogo</Link>
      </main>
    );
  }

  return (
    <main className="contents">
      <h1>{isVendedora ? 'Minhas vendas' : 'Meus pedidos'}</h1>
      <p className="contents">
        {isVendedora
          ? 'Vendas suas fechadas pela cliente através do link de pagamento (ver talão).'
          : 'Pedidos da sua conta — valem em qualquer navegador ou aparelho que você usar pra entrar.'}
      </p>

      {orders === null && <p>Carregando...</p>}
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
                    {order.channel === 'site' ? 'via site' : 'via WhatsApp'}
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
                      <img src={item.image || 'https://via.placeholder.com/80x100?text=Sem+imagem'} alt={item.name} />
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

      <Link href="/" className={publicUi.backLink}>← Voltar ao catálogo</Link>
    </main>
  );
}
