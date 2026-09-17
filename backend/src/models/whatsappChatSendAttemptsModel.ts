import type { PoolClient } from "pg";

// CRUD sobre whatsapp_chat_send_attempts (migration 072) -- uma linha por
// tentativa de envio na aba Conversas do CRM (texto ou template), criada
// como 'queued' ANTES da chamada ao bippa-messaging e depois atualizada com
// o resultado. O `id` desta linha (gerado no INSERT) é a base da
// idempotency_key enviada ao bippa-messaging -- nunca hora atual nem clique
// temporário (ver crmConversationService.ts, sendCrmText/sendCrmTemplate).

export interface WhatsAppChatSendAttemptRow {
    id: string;
    tenant_id: string;
    conversation_id: string;
    seller_id: string;
    kind: "text" | "template";
    status: "queued" | "sent" | "failed";
    to_masked: string;
    template_key: string | null;
    provider_message_id: string | null;
    dispatch_id: string | null;
    error: string | null;
    actor_id: string;
    actor_role: string;
    actor_name: string;
    created_at: Date;
    updated_at: Date;
}

const fields =
    "id, tenant_id, conversation_id, seller_id, kind, status, to_masked, template_key, provider_message_id, dispatch_id, error, actor_id, actor_role, actor_name, created_at, updated_at";

export interface InsertWhatsAppChatSendAttemptInput {
    conversationId: string;
    sellerId: string;
    kind: "text" | "template";
    toMasked: string;
    templateKey?: string;
    actorId: string;
    actorRole: string;
    actorName: string;
}

// Sempre chamada antes de contatar o bippa-messaging -- é o `id` desta
// linha, já persistido, que compõe a idempotency_key do envio (ver
// chat-backend-integration.md, "deve ser gerada a partir de uma ação
// persistida por ele, nunca de hora atual").
export async function insertWhatsAppChatSendAttemptRow(client: PoolClient, input: InsertWhatsAppChatSendAttemptInput): Promise<WhatsAppChatSendAttemptRow> {
    const result = await client.query<WhatsAppChatSendAttemptRow>(
        `INSERT INTO whatsapp_chat_send_attempts
            (tenant_id, conversation_id, seller_id, kind, status, to_masked, template_key, actor_id, actor_role, actor_name)
         VALUES (app_tenant_id(), $1, $2, $3, 'queued', $4, $5, $6, $7, $8)
         RETURNING ${fields}`,
        [input.conversationId, input.sellerId, input.kind, input.toMasked, input.templateKey ?? null, input.actorId, input.actorRole, input.actorName],
    );
    return result.rows[0];
}

export async function markWhatsAppChatSendAttemptSent(client: PoolClient, id: string, dispatchId: string, providerMessageId: string | null): Promise<void> {
    await client.query(
        `UPDATE whatsapp_chat_send_attempts
         SET status = 'sent', dispatch_id = $2, provider_message_id = $3, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1`,
        [id, dispatchId, providerMessageId],
    );
}

export async function markWhatsAppChatSendAttemptFailed(client: PoolClient, id: string, error: string): Promise<void> {
    await client.query(
        `UPDATE whatsapp_chat_send_attempts
         SET status = 'failed', error = $2, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1`,
        [id, error],
    );
}

// Thread de tentativas de uma conversa, mais recente primeiro -- usado para
// reconciliar o estado "enviando" da UI com o resultado real (ver
// useConversationPolling.ts no frontend).
export async function listWhatsAppChatSendAttemptRows(client: PoolClient, conversationId: string, limit = 20): Promise<WhatsAppChatSendAttemptRow[]> {
    const result = await client.query<WhatsAppChatSendAttemptRow>(
        `SELECT ${fields} FROM whatsapp_chat_send_attempts
         WHERE tenant_id = app_tenant_id() AND conversation_id = $1
         ORDER BY created_at DESC LIMIT $2`,
        [conversationId, limit],
    );
    return result.rows;
}
