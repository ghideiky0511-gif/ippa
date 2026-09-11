import type { PoolClient } from "pg";

export type OrderWhatsAppAttemptKind = "order" | "payment_link" | "payment_order";
export type OrderWhatsAppAttemptOutcome = "sent" | "failed";

export interface OrderWhatsAppAttemptRow {
    id: string; order_id: string; kind: OrderWhatsAppAttemptKind; outcome: OrderWhatsAppAttemptOutcome;
    actor_id: string; actor_role: string; actor_name: string;
    to_masked: string; message_id: string | null; error: string | null;
    created_at: Date;
}

const fields = "id, order_id, kind, outcome, actor_id, actor_role, actor_name, to_masked, message_id, error, created_at";

export async function insertOrderWhatsAppAttemptRow(client: PoolClient, value: {
    orderId: string; kind: OrderWhatsAppAttemptKind; outcome: OrderWhatsAppAttemptOutcome;
    actorId: string; actorRole: string; actorName: string;
    toMasked: string; messageId: string | null; error: string | null;
}): Promise<OrderWhatsAppAttemptRow> {
    const result = await client.query<OrderWhatsAppAttemptRow>(
        `INSERT INTO order_whatsapp_send_attempts
           (tenant_id, order_id, kind, outcome, actor_id, actor_role, actor_name, to_masked, message_id, error)
         VALUES (app_tenant_id(), $1, $2, $3, $4, $5::user_role, $6, $7, $8, $9)
         RETURNING ${fields}`,
        [
            value.orderId, value.kind, value.outcome, value.actorId, value.actorRole,
            value.actorName, value.toMasked, value.messageId, value.error,
        ],
    );
    return result.rows[0];
}

// Consulta da página de detalhe de pedido: histórico de UM pedido, mais
// recente primeiro. Mesma forma de listProviderOrderAttemptRowsByOrderId.
export async function listOrderWhatsAppAttemptRowsByOrderId(client: PoolClient, orderId: string): Promise<OrderWhatsAppAttemptRow[]> {
    const result = await client.query<OrderWhatsAppAttemptRow>(
        `SELECT ${fields} FROM order_whatsapp_send_attempts
         WHERE tenant_id = app_tenant_id() AND order_id = $1
         ORDER BY created_at DESC`,
        [orderId],
    );
    return result.rows;
}
