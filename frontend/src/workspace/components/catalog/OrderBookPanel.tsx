'use client';

import { ClipboardList, RotateCcw, Trash2 } from 'lucide-react';
import { formatBRL } from '@/lib/format';
import { adminUi } from '@/workspace/lib/ui';
import type { CartItem, OrderBook, OrderSession } from '@/domain/orders/types';

function itemCount(items: CartItem[]) {
  return items.reduce((total, item) => total + item.qty, 0);
}

function sessionTotal(session: OrderSession) {
  return session.items.reduce((total, item) => total + item.price * item.qty, 0) + (session.shipping?.price || 0);
}

function SessionLabel({ session }: { session: OrderSession }) {
  return <span>{session.clientId ? session.clientName : 'Pedido sem cliente'} · {itemCount(session.items)} peças</span>;
}

export function OrderBookPanel({
  activeBook,
  bookSessions,
  cancelledSessions,
  selectedSessionId,
  onSelectSession,
  saving,
  onCreateOrder,
  onCancelBook,
  onCancelSession,
  onReactivateSession,
}: {
  activeBook: OrderBook | null;
  bookSessions: OrderSession[];
  cancelledSessions: OrderSession[];
  selectedSessionId: string | null;
  onSelectSession: (id: string) => void;
  saving: boolean;
  onCreateOrder: () => void;
  onCancelBook: () => void;
  onCancelSession: (session: OrderSession) => void;
  onReactivateSession: (session: OrderSession) => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-bold">Talão atual</h2>
          <p className="mt-1 text-xs text-brand-muted">{activeBook?.name || 'Carregando talão'}</p>
        </div>
        <ClipboardList className="size-5 text-brand-primary" />
      </div>
      <button type="button" className={`${adminUi.primaryButton} mt-4 w-full`} disabled={!activeBook || activeBook.status !== 'aberto'} onClick={onCreateOrder}>+ Criar pedido</button>
      {activeBook?.status === 'aberto' && (
        <button type="button" className={`${adminUi.button} mt-2 w-full text-red-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700`} disabled={saving} onClick={onCancelBook}>
          <Trash2 className="mr-1 inline size-4" />Cancelar talão
        </button>
      )}
      <div className="mt-4 border-t border-border pt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Continuar pedido</h3>
          <span className="text-xs text-brand-muted">{bookSessions.length}</span>
        </div>
        <div className="mt-3 flex max-h-[55vh] flex-col gap-2 overflow-y-auto">
          {bookSessions.map((session) => (
            <div key={session.id} className={`flex items-stretch rounded-control border transition ${selectedSessionId === session.id ? 'border-brand-primary bg-brand-background' : 'border-border hover:border-brand-primary/40'}`}>
              <button type="button" onClick={() => onSelectSession(session.id)} className="min-w-0 flex-1 p-3 text-left text-sm">
                <strong className="block truncate">{session.clientName || 'Sem cliente'}</strong>
                <span className="mt-1 block text-xs text-brand-muted"><SessionLabel session={session} /></span>
                <span className="mt-1 block text-xs font-semibold text-brand-primary">{formatBRL(sessionTotal(session))}</span>
              </button>
              <button type="button" aria-label={`Cancelar pedido de ${session.clientName || 'sem cliente'}`} title="Cancelar pedido" disabled={saving} onClick={() => onCancelSession(session)} className="group m-1 flex w-9 shrink-0 items-center justify-center rounded-control text-red-500 transition-all duration-200 hover:scale-105 hover:bg-red-50 hover:text-red-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50">
                <Trash2 className="size-4 transition-transform duration-200 group-hover:-rotate-6" />
              </button>
            </div>
          ))}
          {bookSessions.length === 0 && <p className="py-6 text-center text-sm text-brand-muted">Crie um pedido para começar.</p>}
        </div>
      </div>
      {cancelledSessions.length > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Cancelados</h3>
            <span className="text-xs text-brand-muted">{cancelledSessions.length}</span>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {cancelledSessions.map((session) => (
              <div key={session.id} className="rounded-control border border-dashed border-border p-3 text-sm">
                <strong className="block truncate text-brand-muted">{session.clientName || 'Sem cliente'}</strong>
                <span className="mt-1 block text-xs text-brand-muted"><SessionLabel session={session} /></span>
                <button type="button" className={`${adminUi.button} mt-2 inline-flex items-center gap-2`} disabled={saving} onClick={() => onReactivateSession(session)}>
                  <RotateCcw className="size-4" />Reativar no talão
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
