import type { PoolClient } from "pg";

// Só usado a partir de app/api/internal/whatsapp/webhook/route.ts, sob
// withControlTransaction (ver lib/db/control.ts) -- a rota não tem tenant
// resolvido antes de olhar o payload, então estas consultas são
// deliberadamente cross-tenant (mesmo padrão de
// services/erp/catalogSyncService.ts:dispatchCatalogSync). Nenhuma outra
// rota deve chamar estas funções.

export async function findTenantIdByWhatsAppPhoneNumberId(
    client: PoolClient,
    phoneNumberId: string,
): Promise<string | null> {
    const result = await client.query<{ tenant_id: string }>(
        "SELECT tenant_id FROM seller_whatsapp_integrations WHERE phone_number_id = $1 LIMIT 1",
        [phoneNumberId],
    );
    return result.rows[0]?.tenant_id ?? null;
}

export interface InsertWhatsAppWebhookEventInput {
    tenantId: string | null;
    waMessageId: string;
    eventType: string;
    signatureValid: boolean;
    payload: unknown;
}

// ON CONFLICT DO NOTHING contra whatsapp_webhook_events_dedupe_idx
// (wa_message_id, event_type) -- a Meta reentrega o mesmo evento em retry de
// rede, um reenvio não deve duplicar a linha.
export async function insertWhatsAppWebhookEventRow(
    client: PoolClient,
    value: InsertWhatsAppWebhookEventInput,
): Promise<void> {
    await client.query(
        `INSERT INTO whatsapp_webhook_events (tenant_id, wa_message_id, event_type, signature_valid, payload, processed_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (wa_message_id, event_type) WHERE wa_message_id IS NOT NULL DO NOTHING`,
        [value.tenantId, value.waMessageId, value.eventType, value.signatureValid, JSON.stringify(value.payload)],
    );
}
