'use client';

import { useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import type { ClientWithLogin } from '@/domain/clients/types';
import type { Order } from '@/domain/orders/types';
import Link from '@/components/TenantLink';
import { adminUi } from '@/workspace/lib/ui';
import { HubHeader } from '@/workspace/components/shared/HubHeader';
import { ResponsiveDataTable } from '@/workspace/components/shared/ResponsiveDataTable';
import { syncClientFromErp } from '@/workspace/lib/customersClient';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function itemCount(items: Order['items']) {
  return items.reduce((sum, item) => sum + item.qty, 0);
}

const FIELD_LABELS: Record<string, string> = {
  cpfCnpj: 'CPF/CNPJ',
  email: 'E-mail',
  cep: 'CEP',
  street: 'Rua',
  number: 'Número',
  complement: 'Complemento',
  neighborhood: 'Bairro',
  city: 'Cidade',
  state: 'Estado',
};

function InfoField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm text-foreground">{value?.trim() || <span className="text-muted-foreground">Não informado</span>}</p>
    </div>
  );
}

export default function ClientDetailApp({
  initialClient,
  initialOrders,
}: {
  initialClient: ClientWithLogin;
  initialOrders: Order[];
}) {
  const [client, setClient] = useState(initialClient);
  const [orders] = useState(initialOrders);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);

  async function handleSync() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await syncClientFromErp(client.id);
      setClient(result.client);
      setSyncMessage(
        result.updatedFields.length > 0
          ? { type: 'success', text: `Atualizado com dados do ERP: ${result.updatedFields.map((field) => FIELD_LABELS[field] ?? field).join(', ')}.` }
          : { type: 'info', text: 'Cadastro já estava completo — nenhum dado novo encontrado no ERP.' },
      );
    } catch (cause) {
      setSyncMessage({ type: 'error', text: cause instanceof Error ? cause.message : 'Não foi possível sincronizar com o ERP.' });
    } finally {
      setSyncing(false);
    }
  }

  const address = [client.street, client.number].filter(Boolean).join(', ')
    || undefined;

  return (
    <div>
      <HubHeader
        title={client.name}
        description={client.hasLogin ? 'Cadastro com login ativo.' : 'Cadastro sem login.'}
        secondaryActions={
          <Link href="/workspace/clientes" className={adminUi.button}>
            <ArrowLeft className="mr-1.5 inline size-3.5" aria-hidden="true" />Voltar
          </Link>
        }
        primaryAction={{
          label: syncing ? 'Sincronizando...' : 'Sincronizar com ERP',
          onClick: () => void handleSync(),
          disabled: syncing,
          icon: <RefreshCw className={`mr-1.5 inline size-3.5 ${syncing ? 'animate-spin' : ''}`} aria-hidden="true" />,
        }}
      />

      <main className={`${adminUi.productsEditor} flex flex-col gap-6`}>
        {syncMessage && (
          <p
            className={`rounded-brand border p-3 text-sm ${
              syncMessage.type === 'error'
                ? 'border-[#dba0a0] bg-[#fff1f1] text-[#b00020]'
                : syncMessage.type === 'success'
                  ? 'border-brand-primary/30 bg-brand-primary/8 text-brand-primary'
                  : 'border-border bg-surface text-muted-foreground'
            }`}
          >
            {syncMessage.text}
          </p>
        )}

        <section className="rounded-brand border border-border bg-surface p-4">
          <h2 className="font-bold">Cadastro</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoField label="CPF/CNPJ" value={client.cpfCnpj} />
            <InfoField label="E-mail" value={client.email} />
            <InfoField label="CEP" value={client.cep} />
            <InfoField label="Endereço" value={address} />
            <InfoField label="Complemento" value={client.complement} />
            <InfoField label="Bairro" value={client.neighborhood} />
            <InfoField label="Cidade" value={client.city} />
            <InfoField label="Estado" value={client.state} />
            <InfoField label="Cadastro desde" value={new Date(client.createdAt).toLocaleDateString('pt-BR')} />
          </div>
        </section>

        <section className="rounded-brand border border-border bg-surface p-4">
          <div>
            <h2 className="font-bold">Pedidos</h2>
            <p className="mt-1 text-sm text-muted-foreground">Histórico de compras desta cliente.</p>
          </div>
          <ResponsiveDataTable
            rows={orders}
            rowKey={(order) => order.id}
            emptyMessage="Nenhum pedido encontrado para esta cliente."
            columns={[
              { key: 'date', header: 'Data', cell: (order) => new Date(order.date).toLocaleString('pt-BR') },
              { key: 'status', header: 'Status', cell: (order) => order.status },
              { key: 'channel', header: 'Canal', cell: (order) => order.channel },
              { key: 'payment', header: 'Pagamento', cell: (order) => order.paymentMethod || '—' },
              { key: 'items', header: 'Peças', cell: (order) => itemCount(order.items) },
              { key: 'total', header: 'Total', cell: (order) => formatCurrency(order.total) },
            ]}
            mobileCard={(order) => (
              <div className="rounded-brand border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-muted-foreground">{new Date(order.date).toLocaleString('pt-BR')} · {order.channel}</p>
                  <span className="shrink-0 font-bold text-foreground">{formatCurrency(order.total)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{itemCount(order.items)} peças · {order.paymentMethod || '—'}</span>
                  <span className="text-muted-foreground">{order.status}</span>
                </div>
              </div>
            )}
          />
        </section>
      </main>
    </div>
  );
}
