'use client';
import { adminUi } from '@/workspace/lib/ui';
import WorkspaceNav from '@/workspace/navigation/WorkspaceNav';

// Reservado: relatórios (vendas, pedidos, clientes, produtos, receita,
// performance) dependem de métricas que ainda não existem no backend. Este
// módulo só estabelece o lugar na navegação, sem inventar dados.
export default function ReportsApp() {
  return (
    <div>
      <div className={adminUi.topbar}>
        <div className={adminUi.topbarLeft}>
          <h1>Relatórios</h1>
          <WorkspaceNav />
        </div>
      </div>

      <main className={adminUi.productsEditor}>
        <p className={adminUi.previewEmpty}>
          Os relatórios ainda não estão disponíveis — dependem de métricas que ainda não
          existem no backend.
        </p>
      </main>
    </div>
  );
}
