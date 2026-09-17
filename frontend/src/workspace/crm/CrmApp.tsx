'use client';

import { useState } from 'react';
import { HubHeader } from '@/workspace/components/shared/HubHeader';
import { adminUi } from '@/workspace/lib/ui';
import type { ClientsPage } from '@/workspace/lib/customersClient';
import type { CrmInbox } from '@/domain/crm/types';
import ClientsPanel from '@/workspace/customers/ClientsPanel';
import CommercialGroupsPanel from '@/workspace/customers/CommercialGroupsPanel';
import ConversationsPanel from './ConversationsPanel';

const TABS = [
  { id: 'conversas', label: 'Conversas' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'grupos', label: 'Grupos comerciais' },
] as const;
type TabId = typeof TABS[number]['id'];

// Hub de CRM: Conversas (inbox de WhatsApp via bippa-messaging, com cliente
// e grupo comercial do catálogo já vinculados nativamente) ao lado das
// telas de Clientes e Grupos comerciais que já existiam em
// /workspace/clientes (ver ClientsPanel/CommercialGroupsPanel, extraídos de
// CustomersApp.tsx para serem reaproveitados aqui sem duplicação).
export default function CrmApp({
  initialClients,
  initialInboxes,
}: {
  initialClients: ClientsPage;
  initialInboxes: CrmInbox[];
}) {
  const [activeTab, setActiveTab] = useState<TabId>('conversas');
  const isConversas = activeTab === 'conversas';

  return (
    <div>
      <HubHeader title="CRM" description="Converse pelo WhatsApp e gerencie clientes e grupos comerciais num só lugar." />

      <main className="flex min-h-[calc(100dvh-9rem)] flex-col">
        <div className="flex flex-wrap gap-2 border-b border-border bg-surface px-4 py-3 sm:px-6">
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

        <div className={isConversas ? 'flex min-h-0 flex-1' : `${adminUi.productsEditor} flex flex-1 flex-col gap-6 overflow-y-auto`}>
          {activeTab === 'conversas' && <ConversationsPanel initialInboxes={initialInboxes} />}
          {activeTab === 'clientes' && <ClientsPanel initialPage={initialClients} />}
          {activeTab === 'grupos' && <CommercialGroupsPanel />}
        </div>
      </main>
    </div>
  );
}
