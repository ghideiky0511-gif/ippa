'use client';
import { adminUi } from '@/workspace/lib/ui';
import { HubHeader } from '@/workspace/components/shared/HubHeader';

// Reservado: relatórios (vendas, pedidos, clientes, produtos, receita,
// performance) dependem de métricas que ainda não existem no backend. Este
// módulo só estabelece o lugar na navegação, sem inventar dados.
export default function ReportsApp() {
  return (
    <div>
      <HubHeader title="Relatórios" />

      <main className={adminUi.productsEditor}>
        <p className={adminUi.previewEmpty}>
          Os relatórios ainda não estão disponíveis — dependem de métricas que ainda não
          existem no backend.
        </p>
      </main>
    </div>
  );
}
