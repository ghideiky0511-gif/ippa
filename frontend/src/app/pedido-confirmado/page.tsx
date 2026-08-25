'use client';
import { publicUi } from '@/lib/ui';

import Link from '@/components/TenantLink';
import { ArrowLeft } from 'lucide-react';

export default function PedidoConfirmadoPage() {
  return (
    <main className="contents">
      <div className="contents">
        <h1>Pedido confirmado!</h1>
        <p>Seu pedido foi registrado (simulação — nenhuma cobrança real foi feita).</p>
        <div className={publicUi.checkoutActions}>
          <Link href="/pedidos" className={publicUi.primaryButton}>Ver meus pedidos</Link>
        </div>
        <Link href="/" className={publicUi.backLink}><ArrowLeft className="size-4" aria-hidden="true" />Voltar ao catálogo</Link>
      </div>
    </main>
  );
}
