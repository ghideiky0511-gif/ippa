'use client';

import { useState } from 'react';
import { adminUi } from '@/workspace/lib/ui';
import { HubHeader } from '@/workspace/components/shared/HubHeader';
import type { ClientsPage } from '@/workspace/lib/customersClient';
import ClientsPanel from './ClientsPanel';
import CommercialGroupsPanel from './CommercialGroupsPanel';

const TABS = [
  { id: 'clientes', label: 'Clientes' },
  { id: 'grupos', label: 'Grupos comerciais' },
] as const;
type TabId = typeof TABS[number]['id'];

export default function CustomersApp({ initialPage }: { initialPage: ClientsPage }) {
  const [activeTab, setActiveTab] = useState<TabId>('clientes');

  return (
    <div>
      <HubHeader
        title="Hub de clientes"
        description="Consulte a base e importe novos cadastros pelo CPF ou CNPJ."
      />

      <main className={`${adminUi.productsEditor} flex flex-col gap-6`}>
        <div className="contents">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? adminUi.primaryButton : adminUi.button}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'grupos' ? <CommercialGroupsPanel /> : <ClientsPanel initialPage={initialPage} />}
      </main>
    </div>
  );
}
