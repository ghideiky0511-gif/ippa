'use client';

import { useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import type { Order } from '@/domain/orders/types';
import type { ClientWithLogin } from '@/domain/clients/types';
import type { ProviderOrderAttempt, ProviderOrderAttemptOutcome, ProviderOrderRow, ProviderOrderStatus } from '@/workspace/lib/erpIntegrationClient';
import Link from '@/components/TenantLink';
import { adminUi } from '@/workspace/lib/ui';
import { HubHeader } from '@/workspace/components/shared/HubHeader';
import { ResponsiveDataTable } from '@/workspace/components/shared/ResponsiveDataTable';
import { requestOrderPushResend } from '@/workspace/lib/erpIntegrationClient';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function itemCount(items: Order['items']) {
  return items.reduce((sum, item) => sum + item.qty, 0);
}

function InfoField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm text-foreground">{value?.trim() || <span className="text-muted-foreground">Não informado</span>}</p>
    </div>
  );
}

const PUSH_STATUS_LABELS: Record<ProviderOrderStatus, string> = {
  pending: 'Aguardando envio',
  processing: 'Enviando agora',
  cancelling: 'Cancelando no ERP',
  sent: 'Enviado',
  failed: 'Falhou',
};

const PUSH_STATUS_CLASSES: Record<ProviderOrderStatus, string> = {
  pending: 'border-border bg-surface-muted text-muted-foreground',
  processing: 'border-border bg-surface-muted text-muted-foreground',
  cancelling: 'border-border bg-surface-muted text-muted-foreground',
  sent: 'border-brand-primary/30 bg-brand-primary/8 text-brand-primary',
  failed: 'border-[#dba0a0] bg-[#fff1f1] text-[#b00020]',
};

const ATTEMPT_OUTCOME_LABELS: Record<ProviderOrderAttemptOutcome, string> = {
  sent: 'Enviado',
  failed: 'Falhou',
  retry_pending: 'Nova tentativa agendada',
  retry_cancelling: 'Cancelamento agendado',
};

const ATTEMPT_OUTCOME_CLASSES: Record<ProviderOrderAttemptOutcome, string> = {
  sent: 'bg-brand-primary/8 text-brand-primary',
  failed: 'bg-[#fff1f1] text-[#b00020]',
  retry_pending: 'bg-surface-muted text-muted-foreground',
  retry_cancelling: 'bg-surface-muted text-muted-foreground',
};

function StatusBadge({ status }: { status: ProviderOrderStatus }) {
  return (
    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${PUSH_STATUS_CLASSES[status]}`}>
      {PUSH_STATUS_LABELS[status]}
    </span>
  );
}

export default function OrderDetailApp({
  initialOrder,
  initialClient,
  initialPushStatus,
  initialPushHistory,
}: {
  initialOrder: Order;
  initialClient: ClientWithLogin | null;
  initialPushStatus: ProviderOrderRow | null;
  initialPushHistory: ProviderOrderAttempt[];
}) {
  const [order] = useState(initialOrder);
  const [client] = useState(initialClient);
  const [pushStatus, setPushStatus] = useState(initialPushStatus);
  const [pushHistory, setPushHistory] = useState(initialPushHistory);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handleResend() {
    setResending(true);
    setResendMessage(null);
    try {
      const updated = await requestOrderPushResend(order.id);
      setPushStatus(updated);
      setResendMessage({ type: 'success', text: 'Reenvio solicitado — acompanhe o histórico abaixo.' });
    } catch (err) {
      setResendMessage({ type: 'error', text: err instanceof Error ? err.message : 'Não foi possível reenviar o pedido ao ERP.' });
    } finally {
      setResending(false);
    }
  }

  const missingDocument = client !== null && !client.cpfCnpj?.trim();

  return (
    <div>
      <HubHeader
        title={order.clientName || 'Pedido'}
        description={`Pedido de ${new Date(order.date).toLocaleString('pt-BR')} · ${formatCurrency(order.total)}`}
        secondaryActions={
          <Link href="/workspace/pedidos" className={adminUi.button}>
            <ArrowLeft className="mr-1.5 inline size-3.5" aria-hidden="true" />Voltar
          </Link>
        }
      />

      <main className={`${adminUi.productsEditor} flex flex-col gap-6`}>
        <section className="rounded-brand border border-border bg-surface p-4">
          <h2 className="font-bold">Pedido</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoField label="Data" value={new Date(order.date).toLocaleString('pt-BR')} />
            <InfoField label="Status" value={order.status} />
            <InfoField label="Canal" value={order.channel} />
            <InfoField label="Pagamento" value={order.paymentMethod || undefined} />
            <InfoField label="Peças" value={String(itemCount(order.items))} />
            <InfoField label="Total" value={formatCurrency(order.total)} />
          </div>
          <div className="mt-4">
            <p className="text-xs text-muted-foreground">Itens</p>
            <ul className="mt-1 flex flex-col gap-1 text-sm text-foreground">
              {order.items.map((item) => (
                <li key={item.key}>{item.qty}× {item.name}{item.color ? ` · ${item.color}` : ''}{item.size ? ` · ${item.size}` : ''}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="rounded-brand border border-border bg-surface p-4">
          <h2 className="font-bold">Cliente</h2>
          {client ? (
            <>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <InfoField label="Nome" value={client.name} />
                <InfoField label="CPF/CNPJ" value={client.cpfCnpj} />
                <InfoField label="E-mail" value={client.email} />
              </div>
              {missingDocument && (
                <p className="mt-3 rounded-brand border border-[#dba0a0] bg-[#fff1f1] p-3 text-sm text-[#b00020]">
                  Cliente sem CPF/CNPJ cadastrado — obrigatório para envio ao TOTVS Moda.{' '}
                  <Link href={`/workspace/clientes/${client.id}`} className="font-semibold underline">Completar cadastro</Link>
                </p>
              )}
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">{order.clientName || 'Pedido sem cliente vinculado.'}</p>
          )}
        </section>

        <section className="rounded-brand border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold">Integração com ERP</h2>
              <p className="mt-1 text-sm text-muted-foreground">Status do envio deste pedido ao ERP do tenant e histórico de tentativas.</p>
            </div>
            <button type="button" className={adminUi.button} onClick={() => void handleResend()} disabled={resending || pushStatus?.status === 'processing'}>
              <RefreshCw className={`mr-1.5 inline size-3.5 ${resending ? 'animate-spin' : ''}`} aria-hidden="true" />
              {resending ? 'Reenviando...' : 'Reenviar ao ERP'}
            </button>
          </div>

          {resendMessage && (
            <p className={`mt-3 rounded-brand border p-3 text-sm ${resendMessage.type === 'error' ? 'border-[#dba0a0] bg-[#fff1f1] text-[#b00020]' : 'border-brand-primary/30 bg-brand-primary/8 text-brand-primary'}`}>
              {resendMessage.text}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3">
            {pushStatus ? (
              <>
                <StatusBadge status={pushStatus.status} />
                <span className="text-sm text-muted-foreground">{pushStatus.attempts} tentativa(s)</span>
                {pushStatus.external_id && <span className="text-sm text-muted-foreground">ID no ERP: {pushStatus.external_id}</span>}
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Este pedido nunca foi enfileirado para envio ao ERP.</span>
            )}
          </div>
          {pushStatus?.status === 'failed' && pushStatus.last_error && (
            <p className="mt-3 rounded-brand border border-[#dba0a0] bg-[#fff1f1] p-3 text-sm text-[#b00020]">{pushStatus.last_error}</p>
          )}

          <div className="mt-4">
            <h3 className="text-sm font-semibold text-foreground">Histórico de tentativas</h3>
            <ResponsiveDataTable
              rows={pushHistory}
              rowKey={(attempt) => attempt.id}
              emptyMessage="Nenhuma tentativa de envio registrada."
              columns={[
                { key: 'created_at', header: 'Data', cell: (attempt) => new Date(attempt.created_at).toLocaleString('pt-BR') },
                { key: 'attempt_number', header: 'Tentativa', cell: (attempt) => `#${attempt.attempt_number}` },
                { key: 'outcome', header: 'Resultado', cell: (attempt) => <span className={`rounded-full px-2 py-1 text-xs font-semibold ${ATTEMPT_OUTCOME_CLASSES[attempt.outcome]}`}>{ATTEMPT_OUTCOME_LABELS[attempt.outcome]}</span> },
                { key: 'external_id', header: 'ID no ERP', cell: (attempt) => attempt.external_id || '—' },
                { key: 'error', header: 'Erro', cell: (attempt) => attempt.error || '—' },
              ]}
              mobileCard={(attempt) => (
                <div className="rounded-brand border border-border bg-surface p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs text-muted-foreground">{new Date(attempt.created_at).toLocaleString('pt-BR')} · tentativa #{attempt.attempt_number}</p>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${ATTEMPT_OUTCOME_CLASSES[attempt.outcome]}`}>{ATTEMPT_OUTCOME_LABELS[attempt.outcome]}</span>
                  </div>
                  {attempt.external_id && <p className="mt-2 text-sm text-muted-foreground">ID no ERP: {attempt.external_id}</p>}
                  {attempt.error && <p className="mt-2 text-sm text-[#b00020]">{attempt.error}</p>}
                </div>
              )}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
