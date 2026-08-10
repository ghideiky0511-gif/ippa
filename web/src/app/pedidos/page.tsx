'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatBRL } from '@/lib/format';
import { useAuthUser } from '@/components/AuthProvider';
import type { Order } from '@/lib/types';

export default function PedidosPage() {
  const { authUser } = useAuthUser();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const isVendedora = authUser?.role === 'vendedora';

  useEffect(() => {
    if (!authUser) return;
    fetch('/api/orders')
      .then((r) => (r.ok ? r.json() : []))
      .then(setOrders)
      .catch(() => setOrders([]));
  }, [authUser]);

  // Sem login não existe "meus pedidos" — pedido é sempre da conta agora
  // (ver GET /api/orders), não mais um histórico solto por navegador.
  if (!authUser) {
    return (
      <main className="container orders-page">
        <h1>Meus pedidos</h1>
        <div className="cart-empty">
          Entre ou crie uma conta pra ver seus pedidos.
          <div className="checkout-actions">
            <Link href="/login" className="btn-add">Entrar</Link>
            <Link href="/cadastro" className="btn-add">Criar conta</Link>
          </div>
        </div>
        <Link href="/" className="back-link">← Voltar ao catálogo</Link>
      </main>
    );
  }

  return (
    <main className="container orders-page">
      <h1>{isVendedora ? 'Minhas vendas' : 'Meus pedidos'}</h1>
      <p className="orders-hint">
        {isVendedora
          ? 'Vendas suas fechadas pela cliente através do link de pagamento (ver talão).'
          : 'Pedidos da sua conta — valem em qualquer navegador ou aparelho que você usar pra entrar.'}
      </p>

      {orders === null && <p>Carregando...</p>}
      {orders !== null && orders.length === 0 && (
        <p className="cart-empty">{isVendedora ? 'Nenhuma venda fechada ainda.' : 'Nenhum pedido enviado ainda.'}</p>
      )}

      <div className="orders-list">
        {orders?.map((order) => (
          <div className="order-card" key={order.id}>
            <div className="order-card-header">
              <span>
                {new Date(order.date).toLocaleString('pt-BR')}
                <span className="order-channel-badge">
                  {order.channel === 'site' ? 'via site' : 'via WhatsApp'}
                </span>
              </span>
              <span className="order-total">{formatBRL(order.total)}</span>
            </div>
            {isVendedora && order.clientName && <div className="order-meta"><span>Cliente: {order.clientName}</span></div>}
            {(order.shipping || order.paymentMethod || order.discount) && (
              <div className="order-meta">
                {order.shipping && <span>Frete: {order.shipping.label}</span>}
                {order.paymentMethod && <span>Pagamento: {order.paymentMethod}</span>}
                {order.discount && (
                  <span className="order-discount-badge">
                    Desconto: {order.discount.label} (-{formatBRL(order.discount.amount)})
                  </span>
                )}
              </div>
            )}
            <div className="order-items">
              {order.items.map((item) => (
                <div className="order-item" key={item.key}>
                  <img src={item.image || 'https://via.placeholder.com/80x100?text=Sem+imagem'} alt={item.name} />
                  <div>
                    <div className="name">{item.name}</div>
                    <div className="variant">
                      {[item.color, item.size].filter(Boolean).join(' · ')} — {item.qty}x {formatBRL(item.price)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Link href="/" className="back-link">← Voltar ao catálogo</Link>
    </main>
  );
}
