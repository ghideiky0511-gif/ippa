'use client';

import { useEffect, useMemo, useRef } from 'react';
import { adminUi } from '@/workspace/lib/ui';
import type { CrmMessage } from '@/domain/crm/types';

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function messageBody(message: CrmMessage): string {
  if (message.type === 'reaction') return `Reagiu com ${message.body ?? ''}`;
  if (message.type === 'location') return message.body || 'Localização compartilhada';
  if (message.type === 'contacts') return message.body || 'Contato compartilhado';
  if (message.type === 'interactive') return message.body || '[resposta interativa]';
  return message.body || `[${message.type}]`;
}

export default function ConversationThread({
  messages,
  loadingOlder,
  hasMoreOlder,
  onLoadOlder,
}: {
  messages: CrmMessage[];
  loadingOlder: boolean;
  hasMoreOlder: boolean;
  onLoadOlder: () => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastMessageId = messages[messages.length - 1]?.id;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [lastMessageId]);

  const rows = useMemo(() => {
    return messages.map((message, index) => {
      const day = formatDay(message.occurredAt);
      const prevDay = index > 0 ? formatDay(messages[index - 1].occurredAt) : '';
      return { message, day, showDaySeparator: day !== prevDay };
    });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-6">
      {hasMoreOlder && (
        <div className="mb-3 flex justify-center">
          <button type="button" className={adminUi.button} onClick={onLoadOlder} disabled={loadingOlder}>
            {loadingOlder ? 'Carregando...' : 'Carregar mensagens anteriores'}
          </button>
        </div>
      )}
      {messages.length === 0 && !loadingOlder && (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>
      )}
      {rows.map(({ message, day, showDaySeparator }) => {
        const outbound = message.direction === 'outbound';
        return (
          <div key={message.id}>
            {showDaySeparator && (
              <div className="my-3 flex justify-center">
                <span className="rounded-full bg-brand-background px-3 py-1 text-xs font-semibold text-muted-foreground">{day}</span>
              </div>
            )}
            <div className={`mb-2 flex ${outbound ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                  outbound ? 'bg-brand-primary text-white' : 'border border-border bg-surface text-foreground'
                }`}
              >
                {message.contentPurged ? (
                  <p className="italic opacity-70">Conteúdo não disponível (mensagens ficam guardadas por 90 dias).</p>
                ) : (
                  <p className="whitespace-pre-wrap break-words">{messageBody(message)}</p>
                )}
                <p className={`mt-1 text-right text-[11px] ${outbound ? 'text-white/70' : 'text-muted-foreground'}`}>
                  {formatTime(message.occurredAt)}
                </p>
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
