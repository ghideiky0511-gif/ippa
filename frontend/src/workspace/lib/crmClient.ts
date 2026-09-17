import {
    CrmConversationsPageSchema,
    CrmInboxSchema,
    CrmMessagesPageSchema,
    CrmServiceWindowSchema,
    SendCrmMessageResultSchema,
    type CrmConversationsPage,
    type CrmInbox,
    type CrmMessagesPage,
    type CrmServiceWindow,
    type SendCrmMessageResult,
    type SendCrmTemplateInput,
} from '@/domain/crm/types';
import { z } from 'zod';
import { adminJson } from './http';

// Cliente para as rotas /api/crm/* do backend (ver
// backend/src/app/api/[tenantSlug]/crm/*) -- proxy fino sobre o
// bippa-messaging já enriquecido com cliente/grupo comercial do catálogo.
// O navegador nunca fala com o bippa-messaging nem vê a X-Bippa-Api-Key
// (ver backend/docs/mensageria/bippa-messaging/docs/chat-backend-integration.md).

export function fetchCrmInboxes(): Promise<CrmInbox[]> {
    return adminJson('/api/crm/inboxes', z.array(CrmInboxSchema), {}, 'Não foi possível carregar os números de WhatsApp.');
}

export interface FetchCrmConversationsParams {
    phoneId?: string;
    status?: 'open' | 'closed';
    phoneNumber?: string;
    cursor?: string;
    limit?: number;
}

function conversationsPath(params: FetchCrmConversationsParams = {}) {
    const search = new URLSearchParams();
    if (params.phoneId) search.set('phoneId', params.phoneId);
    if (params.status) search.set('status', params.status);
    if (params.phoneNumber) search.set('phoneNumber', params.phoneNumber);
    if (params.cursor) search.set('cursor', params.cursor);
    if (params.limit) search.set('limit', String(params.limit));
    const query = search.toString();
    return `/api/crm/conversations${query ? `?${query}` : ''}`;
}

export function fetchCrmConversations(params?: FetchCrmConversationsParams): Promise<CrmConversationsPage> {
    return adminJson(conversationsPath(params), CrmConversationsPageSchema, { cache: 'no-store' }, 'Não foi possível carregar as conversas.');
}

export interface FetchCrmMessagesParams {
    direction?: 'inbound' | 'outbound';
    cursor?: string;
    limit?: number;
}

function messagesPath(conversationId: string, params: FetchCrmMessagesParams = {}) {
    const search = new URLSearchParams();
    if (params.direction) search.set('direction', params.direction);
    if (params.cursor) search.set('cursor', params.cursor);
    if (params.limit) search.set('limit', String(params.limit));
    const query = search.toString();
    return `/api/crm/conversations/${encodeURIComponent(conversationId)}/messages${query ? `?${query}` : ''}`;
}

export function fetchCrmMessages(conversationId: string, params?: FetchCrmMessagesParams): Promise<CrmMessagesPage> {
    return adminJson(messagesPath(conversationId, params), CrmMessagesPageSchema, { cache: 'no-store' }, 'Não foi possível carregar as mensagens desta conversa.');
}

export function fetchCrmServiceWindow(conversationId: string): Promise<CrmServiceWindow> {
    return adminJson(
        `/api/crm/conversations/${encodeURIComponent(conversationId)}/service-window`,
        CrmServiceWindowSchema,
        { cache: 'no-store' },
        'Não foi possível consultar a janela de atendimento.',
    );
}

export function sendCrmText(conversationId: string, text: string): Promise<SendCrmMessageResult> {
    return adminJson(
        `/api/crm/conversations/${encodeURIComponent(conversationId)}/reply`,
        SendCrmMessageResultSchema,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
        },
        'Não foi possível enviar a mensagem.',
    );
}

export function sendCrmTemplate(conversationId: string, input: SendCrmTemplateInput): Promise<SendCrmMessageResult> {
    return adminJson(
        `/api/crm/conversations/${encodeURIComponent(conversationId)}/template`,
        SendCrmMessageResultSchema,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
        },
        'Não foi possível enviar o template.',
    );
}

// clientId: null desvincula a conversa. Sempre grava link_source: 'manual'
// no backend -- nunca sobrescrito pelo auto-match numa releitura da inbox.
export function linkCrmConversationClient(conversationId: string, clientId: string | null): Promise<{ clientId: string | null }> {
    return adminJson(
        `/api/crm/conversations/${encodeURIComponent(conversationId)}/client`,
        z.object({ clientId: z.string().nullable() }),
        {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId }),
        },
        'Não foi possível vincular o cliente a esta conversa.',
    );
}
