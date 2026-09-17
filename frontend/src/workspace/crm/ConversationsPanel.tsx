'use client';

import { useCallback, useEffect, useState } from 'react';
import { Link2, MessageCircleWarning, RefreshCw } from 'lucide-react';
import Link from '@/components/TenantLink';
import { adminUi } from '@/workspace/lib/ui';
import type { CrmConversation, CrmInbox, CrmMessage } from '@/domain/crm/types';
import { fetchCrmConversations, fetchCrmInboxes, fetchCrmMessages } from '@/workspace/lib/crmClient';
import ConversationThread from './ConversationThread';
import MessageComposer from './MessageComposer';
import LinkClientModal from './LinkClientModal';
import { useConversationPolling } from './useConversationPolling';

// Intervalos-base do polling controlado (ver useConversationPolling.ts) --
// só a lista (quando nenhuma conversa está aberta) ou a conversa aberta são
// atualizadas, nunca a inbox inteira em segundo plano (ver
// chat-backend-integration.md, "Operação em escala").
const LIST_POLL_MS = 15_000;
const THREAD_POLL_MS = 8_000;

function formatRelative(iso: string | null): string {
  if (!iso) return '';
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${diffMin}min`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function contactLabel(conversation: CrmConversation): string {
  if (conversation.client?.name) return conversation.client.name;
  if (conversation.contactName) return conversation.contactName;
  return conversation.phoneNumber ? `+${conversation.phoneNumber}` : 'Contato';
}

export default function ConversationsPanel({ initialInboxes }: { initialInboxes: CrmInbox[] }) {
  const [inboxes, setInboxes] = useState(initialInboxes);
  const [selectedPhoneId, setSelectedPhoneId] = useState<string | undefined>(undefined);
  const [conversations, setConversations] = useState<CrmConversation[]>([]);
  const [convLoading, setConvLoading] = useState(true);
  const [convError, setConvError] = useState<string | null>(null);

  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CrmMessage[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [msgLoadingOlder, setMsgLoadingOlder] = useState(false);
  const [msgHasMoreOlder, setMsgHasMoreOlder] = useState(false);
  const [msgCursor, setMsgCursor] = useState<string | null>(null);
  const [msgError, setMsgError] = useState<string | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);

  const loadConversations = useCallback(async (phoneId: string | undefined) => {
    setConvLoading(true);
    setConvError(null);
    try {
      const page = await fetchCrmConversations({ phoneId, limit: 30 });
      setConversations(page.data);
    } catch (cause) {
      setConvError(cause instanceof Error ? cause.message : 'Não foi possível carregar as conversas.');
    } finally {
      setConvLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadConversations(selectedPhoneId);
  }, [selectedPhoneId, loadConversations]);

  useEffect(() => {
    // Números podem terminar de conectar depois da carga inicial da
    // página (SSR) -- uma releitura silenciosa no mount cobre isso sem
    // exigir um refresh manual da página inteira.
    fetchCrmInboxes().then(setInboxes).catch(() => {});
  }, []);

  useConversationPolling(() => loadConversations(selectedPhoneId), {
    baseIntervalMs: LIST_POLL_MS,
    enabled: inboxes.length > 0,
  });

  const selectedConversation = conversations.find((conversation) => conversation.id === selectedConversationId) ?? null;
  const noInboxesConnected = inboxes.length === 0;

  const loadMessages = useCallback(async (conversationId: string, reset: boolean) => {
    if (reset) {
      setMsgLoading(true);
      setMessages([]);
      setMsgCursor(null);
    } else {
      setMsgLoadingOlder(true);
    }
    setMsgError(null);
    try {
      const page = await fetchCrmMessages(conversationId, reset ? { limit: 50 } : { cursor: msgCursor ?? undefined, limit: 50 });
      setMessages((prev) => (reset ? page.data : [...page.data, ...prev]));
      setMsgHasMoreOlder(page.page.hasMore);
      setMsgCursor(page.page.nextCursor);
    } catch (cause) {
      setMsgError(cause instanceof Error ? cause.message : 'Não foi possível carregar as mensagens.');
    } finally {
      setMsgLoading(false);
      setMsgLoadingOlder(false);
    }
  }, [msgCursor]);

  function selectConversation(id: string) {
    setSelectedConversationId(id);
    void loadMessages(id, true);
  }

  useConversationPolling(
    async () => {
      if (!selectedConversationId) return;
      const page = await fetchCrmMessages(selectedConversationId, { limit: 50 });
      setMessages((prev) => {
        // Mescla pelo id em vez de substituir -- preserva mensagens mais
        // antigas já trazidas por "carregar mais" enquanto atualiza as
        // recentes (novo status, novas mensagens) a cada poll.
        const byId = new Map(prev.map((message) => [message.id, message]));
        for (const message of page.data) byId.set(message.id, message);
        return [...byId.values()].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
      });
    },
    { baseIntervalMs: THREAD_POLL_MS, enabled: Boolean(selectedConversationId) },
  );

  if (noInboxesConnected) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <MessageCircleWarning className="size-10 text-muted-foreground" aria-hidden="true" />
        <p className="max-w-sm text-sm text-muted-foreground">
          Nenhum número de WhatsApp conectado ainda. Conecte um número para ver e responder conversas por aqui.
        </p>
        <Link href="/workspace/integracoes/whatsapp" className={adminUi.primaryButton}>
          Conectar WhatsApp
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
      <aside className="flex min-h-0 w-full flex-col border-b border-border sm:w-80 sm:shrink-0 sm:border-r sm:border-b-0">
        {inboxes.length > 1 && (
          <div className={`${adminUi.field} border-b border-border p-3`}>
            <label htmlFor="crm-inbox-select">Número</label>
            <select
              id="crm-inbox-select"
              value={selectedPhoneId ?? ''}
              onChange={(event) => setSelectedPhoneId(event.target.value || undefined)}
            >
              <option value="">Todos os números</option>
              {inboxes.map((inbox) => (
                <option key={inbox.phoneId} value={inbox.phoneId}>
                  {inbox.sellerName}{inbox.displayPhoneMasked ? ` · ${inbox.displayPhoneMasked}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
        {inboxes.length === 1 && (
          <div className="border-b border-border px-3 py-2 text-sm text-muted-foreground">
            {inboxes[0].sellerName}{inboxes[0].displayPhoneMasked ? ` · ${inboxes[0].displayPhoneMasked}` : ''}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {convError && <p className="p-3 text-sm text-[#b00020]">{convError}</p>}
          {convLoading && conversations.length === 0 && <p className="p-3 text-sm text-muted-foreground">Carregando conversas...</p>}
          {!convLoading && conversations.length === 0 && !convError && (
            <p className="p-3 text-sm text-muted-foreground">Nenhuma conversa ainda.</p>
          )}
          <ul>
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <button
                  type="button"
                  className={`flex w-full flex-col gap-0.5 border-b border-border px-3 py-2.5 text-left transition-colors hover:bg-brand-background ${
                    selectedConversationId === conversation.id ? 'bg-brand-primary/10' : ''
                  }`}
                  onClick={() => selectConversation(conversation.id)}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-foreground">{contactLabel(conversation)}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{formatRelative(conversation.updatedAt)}</span>
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{conversation.preview || '—'}</span>
                  {inboxes.length > 1 && !selectedPhoneId && (
                    <span className="text-[11px] text-muted-foreground">{conversation.sellerName}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <section className="flex min-h-0 flex-1 flex-col">
        {!selectedConversation ? (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
            Selecione uma conversa para começar a atender.
          </div>
        ) : (
          <>
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-4 py-3 sm:px-6">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-foreground">{contactLabel(selectedConversation)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {selectedConversation.phoneNumber ? `+${selectedConversation.phoneNumber}` : ''}
                  {selectedConversation.commercialGroup ? ` · Grupo: ${selectedConversation.commercialGroup.name}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedConversation.client && (
                  <Link href={`/workspace/clientes/${selectedConversation.client.id}`} className={adminUi.button}>
                    Ver cliente
                  </Link>
                )}
                <button type="button" className={adminUi.button} onClick={() => setShowLinkModal(true)}>
                  <Link2 className="mr-1.5 inline size-3.5" aria-hidden="true" />
                  {selectedConversation.client ? 'Trocar vínculo' : 'Vincular cliente'}
                </button>
                <button
                  type="button"
                  className={adminUi.iconButton}
                  aria-label="Atualizar mensagens"
                  onClick={() => void loadMessages(selectedConversation.id, true)}
                >
                  <RefreshCw className="size-4" aria-hidden="true" />
                </button>
              </div>
            </header>

            {!selectedConversation.client && (
              <div className="border-b border-border bg-brand-background/60 px-4 py-2 text-xs text-muted-foreground sm:px-6">
                {selectedConversation.linkCandidates && selectedConversation.linkCandidates.length > 0
                  ? 'Mais de um cliente usa este telefone -- escolha qual vincular.'
                  : 'Nenhum cliente do catálogo com este telefone ainda.'}
              </div>
            )}

            {msgError && <p className="px-4 py-2 text-sm text-[#b00020] sm:px-6">{msgError}</p>}
            <ConversationThread
              messages={messages}
              loadingOlder={msgLoading || msgLoadingOlder}
              hasMoreOlder={msgHasMoreOlder}
              onLoadOlder={() => void loadMessages(selectedConversation.id, false)}
            />
            <MessageComposer
              conversationId={selectedConversation.id}
              sellerId={selectedConversation.sellerId}
              onSent={() => void loadMessages(selectedConversation.id, true)}
            />
          </>
        )}
      </section>

      {showLinkModal && selectedConversation && (
        <LinkClientModal
          conversationId={selectedConversation.id}
          currentClientId={selectedConversation.client?.id ?? null}
          linkCandidates={selectedConversation.linkCandidates}
          onClose={() => setShowLinkModal(false)}
          onLinked={() => {
            setShowLinkModal(false);
            void loadConversations(selectedPhoneId);
          }}
        />
      )}
    </div>
  );
}
