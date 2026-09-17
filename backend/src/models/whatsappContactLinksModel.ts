import type { PoolClient } from "pg";

// CRUD sobre whatsapp_contact_links (migration 072) -- vínculo entre uma
// conversa do bippa-messaging e um cliente do catálogo, e único lugar do
// Catálogo onde fica registrado a qual phone_id (número WABA) uma conversa
// pertence (ver comentário na migration). Uma linha por conversationId,
// nunca apagada -- só client_id/link_source mudam com o tempo.

export interface WhatsAppContactLinkRow {
    id: string;
    tenant_id: string;
    conversation_id: string;
    phone_id: string;
    phone_e164: string;
    client_id: string | null;
    link_source: "auto" | "manual";
    linked_by: string | null;
    created_at: Date;
    updated_at: Date;
}

const fields =
    "id, tenant_id, conversation_id, phone_id, phone_e164, client_id, link_source, linked_by, created_at, updated_at";

export async function findWhatsAppContactLinkRow(client: PoolClient, conversationId: string): Promise<WhatsAppContactLinkRow | null> {
    const result = await client.query<WhatsAppContactLinkRow>(
        `SELECT ${fields} FROM whatsapp_contact_links WHERE tenant_id = app_tenant_id() AND conversation_id = $1`,
        [conversationId],
    );
    return result.rows[0] ?? null;
}

// Lookup em lote -- usado por listCrmConversations para enriquecer uma
// página inteira de conversas sem uma query por linha.
export async function listWhatsAppContactLinkRowsByConversationIds(client: PoolClient, conversationIds: string[]): Promise<WhatsAppContactLinkRow[]> {
    if (conversationIds.length === 0) return [];
    const result = await client.query<WhatsAppContactLinkRow>(
        `SELECT ${fields} FROM whatsapp_contact_links WHERE tenant_id = app_tenant_id() AND conversation_id = ANY($1::text[])`,
        [conversationIds],
    );
    return result.rows;
}

export interface UpsertWhatsAppContactLinkInput {
    conversationId: string;
    phoneId: string;
    phoneE164: string;
    clientId: string | null;
    linkSource: "auto" | "manual";
    linkedBy: string | null;
}

// Cria ou atualiza o vínculo. Chamado tanto pelo auto-match (link_source
// 'auto', linkedBy null) quanto pela ação manual da operadora (link_source
// 'manual', linkedBy = user.id) -- o serviço decide qual variante chamar,
// nunca sobrescrevendo 'manual' com um resultado 'auto' (ver
// crmConversationService.ts).
export async function upsertWhatsAppContactLinkRow(client: PoolClient, input: UpsertWhatsAppContactLinkInput): Promise<WhatsAppContactLinkRow> {
    const result = await client.query<WhatsAppContactLinkRow>(
        `INSERT INTO whatsapp_contact_links (tenant_id, conversation_id, phone_id, phone_e164, client_id, link_source, linked_by)
         VALUES (app_tenant_id(), $1, $2, $3, $4, $5, $6)
         ON CONFLICT (tenant_id, conversation_id) DO UPDATE SET
            phone_id = $2,
            phone_e164 = $3,
            client_id = $4,
            link_source = $5,
            linked_by = $6,
            updated_at = now()
         RETURNING ${fields}`,
        [input.conversationId, input.phoneId, input.phoneE164, input.clientId, input.linkSource, input.linkedBy],
    );
    return result.rows[0];
}

// Registra (ou reafirma) só o phone_id de uma conversa recém-vista na
// listagem, sem tocar num vínculo de cliente já existente -- usado quando o
// auto-match não resolveu (0 ou ≥2 candidatos) mas a linha precisa existir
// mesmo assim, para requireKnownConversationScope conseguir validar o
// escopo depois. ON CONFLICT não mexe em client_id/link_source/linked_by
// de propósito: uma releitura da inbox nunca deve apagar um vínculo manual
// já feito.
export async function touchWhatsAppContactLinkPhoneRow(client: PoolClient, conversationId: string, phoneId: string, phoneE164: string): Promise<WhatsAppContactLinkRow> {
    const result = await client.query<WhatsAppContactLinkRow>(
        `INSERT INTO whatsapp_contact_links (tenant_id, conversation_id, phone_id, phone_e164, client_id, link_source, linked_by)
         VALUES (app_tenant_id(), $1, $2, $3, NULL, 'auto', NULL)
         ON CONFLICT (tenant_id, conversation_id) DO UPDATE SET
            phone_id = $2,
            phone_e164 = $3,
            updated_at = now()
         RETURNING ${fields}`,
        [conversationId, phoneId, phoneE164],
    );
    return result.rows[0];
}
