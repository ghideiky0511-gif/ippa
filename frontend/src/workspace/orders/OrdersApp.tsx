'use client';
import { adminUi } from '@/workspace/lib/ui';
import WorkspaceNav from '@/workspace/navigation/WorkspaceNav';

// O backend ainda não tem uma listagem de pedidos por tenant (só
// `orders.userOrders`, escopada ao próprio usuário) — este módulo fica
// reservado no menu até essa capacidade existir no backend.
export default function OrdersApp() {
  return (
    <div>
      <div className={adminUi.topbar}>
        <div className={adminUi.topbarLeft}>
          <h1>Pedidos</h1>
          <WorkspaceNav />
        </div>
      </div>

      <main className={adminUi.productsEditor}>
        <p className={adminUi.previewEmpty}>
          A visão de pedidos do tenant ainda não está disponível — depende de uma listagem
          de pedidos no backend que ainda não existe.
        </p>
      </main>
    </div>
  );
}
