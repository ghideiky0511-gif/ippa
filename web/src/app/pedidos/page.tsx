'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatBRL } from '@/lib/format';
import { readOrders } from '@/components/CartProvider';
import type { Order } from '@/lib/types';

export default function PedidosPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    setOrders(readOrders());
  }, []);

  return (
    <main className="container orders-page">
      <h1>Meus pedidos</h1>
      <p className="orders-hint">
        Pedidos enviados por este navegador (via WhatsApp ou pelo fluxo do site). Ainda não há
        integração com um sistema de pedidos real (isso está previsto para a Fase 2, junto com Bippa/ERP).
      </p>

      {orders === null && <p>Carregando...</p>}
      {orders !== null && orders.length === 0 && <p className="cart-empty">Nenhum pedido enviado ainda.</p>}

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
            {(order.shipping || order.paymentMethod) && (
              <div className="order-meta">
                {order.shipping && <span>Frete: {order.shipping.label}</span>}
                {order.paymentMethod && <span>Pagamento: {order.paymentMethod}</span>}
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
