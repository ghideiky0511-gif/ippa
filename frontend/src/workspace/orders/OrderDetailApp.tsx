'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Ban, CheckCircle2, PackagePlus, Printer, RefreshCw, Wrench } from 'lucide-react';
import type { Order, OrderSession } from '@/domain/orders/types';
import type { ClientWithLogin } from '@/domain/clients/types';
import type { ProviderOrderAttempt, ProviderOrderAttemptOutcome, ProviderOrderRow, ProviderOrderStatus } from '@/workspace/lib/erpIntegrationClient';
import Link from '@/components/TenantLink';
import { useTenant } from '@/components/TenantProvider';
import { adminUi } from '@/workspace/lib/ui';
import { HubHeader } from '@/workspace/components/shared/HubHeader';
import { ResponsiveDataTable } from '@/workspace/components/shared/ResponsiveDataTable';
import { requestOrderPushResend } from '@/workspace/lib/erpIntegrationClient';
import { useWorkspaceAuth } from '@/workspace/components/WorkspaceAuthProvider';
import { Sheet, SheetContent, SheetHeader, SheetTrigger } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogCloseButton, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { markOrderPaid, cancelOrder, updateOrderSession } from '@/lib/ordersClient';
import { StatusChip, type StatusChipTone } from '@/components/StatusChip';
import { ORDER_STATUS_LABELS, OrderStatusChip } from './orderStatus';

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
  cancelled: 'Cancelado no ERP',
};

const PUSH_STATUS_TONES: Record<ProviderOrderStatus, StatusChipTone> = {
  pending: 'neutral',
  processing: 'neutral',
  cancelling: 'neutral',
  sent: 'brand',
  failed: 'danger',
  cancelled: 'neutral',
};

const ATTEMPT_OUTCOME_LABELS: Record<ProviderOrderAttemptOutcome, string> = {
  sent: 'Enviado',
  failed: 'Falhou',
  retry_pending: 'Nova tentativa agendada',
  retry_cancelling: 'Cancelamento agendado',
};

const ATTEMPT_OUTCOME_TONES: Record<ProviderOrderAttemptOutcome, StatusChipTone> = {
  sent: 'brand',
  failed: 'danger',
  retry_pending: 'neutral',
  retry_cancelling: 'neutral',
};

function StatusBadge({ status }: { status: ProviderOrderStatus }) {
  return <StatusChip label={PUSH_STATUS_LABELS[status]} tone={PUSH_STATUS_TONES[status]} />;
}

type ConfirmAction = 'mark-paid' | 'cancel';

export default function OrderDetailApp({
  initialOrder,
  initialClient,
  initialPushStatus,
  initialPushHistory,
  initialSession,
}: {
  initialOrder: Order;
  initialClient: ClientWithLogin | null;
  initialPushStatus: ProviderOrderRow | null;
  initialPushHistory: ProviderOrderAttempt[];
  initialSession: OrderSession | null;
}) {
  const [order, setOrder] = useState(initialOrder);
  const [client] = useState(initialClient);
  const [pushStatus, setPushStatus] = useState(initialPushStatus);
  const [pushHistory] = useState(initialPushHistory);
  const [session] = useState(initialSession);
  const [resending, setResending] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [paymentMethodInput, setPaymentMethodInput] = useState('');
  const [actionPending, setActionPending] = useState(false);
  const [upsellPending, setUpsellPending] = useState(false);

  const router = useRouter();
  const { href } = useTenant();
  const { workspaceUser } = useWorkspaceAuth();
  const canManageOrder = Boolean(workspaceUser) && workspaceUser?.role !== 'cliente';
  const canMarkPaid = order.status !== 'aberto' && order.status !== 'pago' && order.status !== 'cancelado';
  const canCancel = order.status !== 'pago' && order.status !== 'cancelado';
  // Upsell: reabre o atendimento que originou este pedido e leva pro
  // catálogo -- mesmo fluxo de sempre pra adicionar peça (websocket na
  // sessão ativa), só que numa sessão que já tinha fechado ao finalizar. O
  // backend só recusa mutação em pedido cancelado (canMutateLinkedOrder em
  // orderSessionService.ts), então não há necessidade de checar o status do
  // pedido além disso.
  const canUpsell = canManageOrder && Boolean(session) && order.status !== 'cancelado';

  async function startUpsell() {
    if (!session) return;
    setUpsellPending(true);
    try {
      if (session.status !== 'aberto') await updateOrderSession(session.id, { status: 'aberto' });
      router.push(href(`/catalogo?session=${encodeURIComponent(session.id)}`));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível reabrir o atendimento.');
      setUpsellPending(false);
    }
  }

  async function handleResend() {
    setResending(true);
    try {
      const updated = await requestOrderPushResend(order.id);
      setPushStatus(updated);
      toast.success('Reenvio solicitado — acompanhe o histórico abaixo.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível reenviar o pedido ao ERP.');
    } finally {
      setResending(false);
    }
  }

  async function runConfirmedAction() {
    setActionPending(true);
    try {
      if (confirmAction === 'mark-paid') {
        const updated = await markOrderPaid(order.id, paymentMethodInput || undefined);
        setOrder(updated);
        toast.success('Pedido marcado como pago.');
      } else if (confirmAction === 'cancel') {
        const { order: updated, erpWarning } = await cancelOrder(order.id);
        setOrder(updated);
        toast.success('Pedido cancelado.');
        if (erpWarning) toast.error(`Cancelado localmente, mas houve um problema ao cancelar no ERP: ${erpWarning}`);
      }
      setConfirmAction(null);
      setPaymentMethodInput('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível concluir a ação.');
    } finally {
      setActionPending(false);
    }
  }

  const missingDocument = client !== null && !client.cpfCnpj?.trim();

  return (
    <div>
      <div className="print:hidden">
        <HubHeader
          title={`Pedido nº ${order.orderNumber}${order.clientName ? ` · ${order.clientName}` : ''}`}
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
              <InfoField label="Número do pedido" value={String(order.orderNumber)} />
              <InfoField label="Data" value={new Date(order.date).toLocaleString('pt-BR')} />
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <div className="mt-0.5"><OrderStatusChip status={order.status} /></div>
              </div>
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
            <h2 className="font-bold">Integração com ERP</h2>
            <p className="mt-1 text-sm text-muted-foreground">Status do envio deste pedido ao ERP do tenant e histórico de tentativas.</p>

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
                  { key: 'outcome', header: 'Resultado', cell: (attempt) => <StatusChip label={ATTEMPT_OUTCOME_LABELS[attempt.outcome]} tone={ATTEMPT_OUTCOME_TONES[attempt.outcome]} /> },
                  { key: 'external_id', header: 'ID no ERP', cell: (attempt) => attempt.external_id || '—' },
                  { key: 'error', header: 'Erro', cell: (attempt) => attempt.error || '—' },
                ]}
                mobileCard={(attempt) => (
                  <div className="rounded-brand border border-border bg-surface p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-muted-foreground">{new Date(attempt.created_at).toLocaleString('pt-BR')} · tentativa #{attempt.attempt_number}</p>
                      <span className="shrink-0"><StatusChip label={ATTEMPT_OUTCOME_LABELS[attempt.outcome]} tone={ATTEMPT_OUTCOME_TONES[attempt.outcome]} /></span>
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

      {/* Comprovante -- só visível na impressão (ver print:hidden acima e hidden/print:block aqui). */}
      <div className="hidden p-8 print:block">
        <h1 className="text-lg font-bold">Comprovante de pedido</h1>
        <p className="mt-1 text-sm">Cliente: {client?.name ?? order.clientName ?? '—'}{client?.cpfCnpj ? ` · ${client.cpfCnpj}` : ''}</p>
        <p className="text-sm">Data: {new Date(order.date).toLocaleString('pt-BR')}</p>
        <p className="text-sm">Status: {ORDER_STATUS_LABELS[order.status]}</p>
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr><th className="text-left">Item</th><th className="text-right">Qtd</th><th className="text-right">Preço</th></tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.key}>
                <td>{item.name}{item.color ? ` · ${item.color}` : ''}{item.size ? ` · ${item.size}` : ''}</td>
                <td className="text-right">{item.qty}</td>
                <td className="text-right">{formatCurrency(item.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {order.discount && <p className="mt-2 text-sm">Desconto ({order.discount.label}): -{formatCurrency(order.discount.amount)}</p>}
        {order.freight && <p className="text-sm">Frete: {formatCurrency(order.freight.price)}</p>}
        <p className="mt-2 text-base font-bold">Total: {formatCurrency(order.total)}</p>
        <p className="text-sm">Forma de pagamento: {order.paymentMethod || '—'}</p>
      </div>

      <Sheet open={fabOpen} onOpenChange={setFabOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            aria-label="Ferramentas do pedido"
            className="fixed right-6 bottom-6 z-40 flex size-14 cursor-pointer items-center justify-center rounded-full border-0 bg-brand-primary text-white shadow-float transition-transform hover:bg-brand-primary-dark active:scale-95 print:hidden"
          >
            <Wrench className="size-6" aria-hidden="true" />
          </button>
        </SheetTrigger>
        <SheetContent mobileSide="bottom" className="w-[min(24rem,90vw)]">
          <SheetHeader><span className="text-sm font-extrabold text-foreground">Ferramentas do pedido</span></SheetHeader>
          <div className="flex flex-col gap-0.5 p-3">
            <button
              type="button"
              className="flex w-full cursor-pointer items-center rounded-md bg-transparent px-2.5 py-2.5 text-left text-sm font-semibold text-foreground hover:bg-brand-background disabled:cursor-not-allowed disabled:opacity-50"
              disabled={resending || pushStatus?.status === 'processing'}
              onClick={() => { setFabOpen(false); void handleResend(); }}
            >
              <RefreshCw className={`mr-2 size-3.5 ${resending ? 'animate-spin' : ''}`} aria-hidden="true" />
              {resending ? 'Reenviando...' : 'Reenviar ao ERP'}
            </button>
            {canUpsell && (
              <button
                type="button"
                className="flex w-full cursor-pointer items-center rounded-md bg-transparent px-2.5 py-2.5 text-left text-sm font-semibold text-foreground hover:bg-brand-background disabled:cursor-not-allowed disabled:opacity-50"
                disabled={upsellPending}
                onClick={() => { setFabOpen(false); void startUpsell(); }}
              >
                <PackagePlus className="mr-2 size-3.5" aria-hidden="true" />
                {upsellPending ? 'Abrindo...' : 'Adicionar peças'}
              </button>
            )}
            {canManageOrder && canMarkPaid && (
              <button
                type="button"
                className="flex w-full cursor-pointer items-center rounded-md bg-transparent px-2.5 py-2.5 text-left text-sm font-semibold text-foreground hover:bg-brand-background"
                onClick={() => { setFabOpen(false); setConfirmAction('mark-paid'); }}
              >
                <CheckCircle2 className="mr-2 size-3.5" aria-hidden="true" />Marcar como pago
              </button>
            )}
            {canManageOrder && canCancel && (
              <button
                type="button"
                className="flex w-full cursor-pointer items-center rounded-md bg-transparent px-2.5 py-2.5 text-left text-sm font-semibold text-[#b00020] hover:bg-[#fff1f1]"
                onClick={() => { setFabOpen(false); setConfirmAction('cancel'); }}
              >
                <Ban className="mr-2 size-3.5" aria-hidden="true" />Cancelar pedido
              </button>
            )}
            <button
              type="button"
              className="flex w-full cursor-pointer items-center rounded-md bg-transparent px-2.5 py-2.5 text-left text-sm font-semibold text-foreground hover:bg-brand-background"
              onClick={() => { setFabOpen(false); window.print(); }}
            >
              <Printer className="mr-2 size-3.5" aria-hidden="true" />Imprimir comprovante
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={confirmAction !== null} onOpenChange={(open) => { if (!open) { setConfirmAction(null); setPaymentMethodInput(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmAction === 'mark-paid' ? 'Marcar pedido como pago?' : 'Cancelar pedido?'}</DialogTitle>
            <DialogCloseButton />
          </DialogHeader>
          <DialogDescription>
            {confirmAction === 'mark-paid'
              ? 'Registra este pedido como pago manualmente (dinheiro, Pix direto etc.) — não passa por nenhum gateway de pagamento real.'
              : 'Cancela o pedido e as sessões/talão abertos vinculados a ele. Se o pedido já foi enviado ao ERP, o cancelamento também será tentado lá.'}
          </DialogDescription>
          {confirmAction === 'mark-paid' && (
            <div className={`${adminUi.field} mt-3`}>
              <label>Forma de pagamento (opcional)</label>
              <select value={paymentMethodInput} onChange={(event) => setPaymentMethodInput(event.target.value)}>
                <option value="">Não informar</option>
                <option value="Dinheiro">Dinheiro</option>
                <option value="Pix">Pix</option>
                <option value="Cartão">Cartão</option>
                <option value="Outro">Outro</option>
              </select>
            </div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className={adminUi.button} onClick={() => { setConfirmAction(null); setPaymentMethodInput(''); }}>Voltar</button>
            <button
              type="button"
              className={confirmAction === 'cancel' ? adminUi.dangerButton : adminUi.primaryButton}
              disabled={actionPending}
              onClick={() => void runConfirmedAction()}
            >
              {actionPending ? 'Processando...' : 'Confirmar'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
