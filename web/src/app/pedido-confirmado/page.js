'use client';

import Link from 'next/link';

export default function PedidoConfirmadoPage() {
  return (
    <main className="container order-confirmed-page">
      <div className="order-confirmed-box">
        <h1>Pedido confirmado!</h1>
        <p>Seu pedido foi registrado (simulação — nenhuma cobrança real foi feita).</p>
        <div className="checkout-actions">
          <Link href="/pedidos" className="btn-add">Ver meus pedidos</Link>
        </div>
        <Link href="/" className="back-link">← Voltar ao catálogo</Link>
      </div>
    </main>
  );
}
