import type { PoolClient } from "pg";

export type ProviderOrderStatus = "pending" | "processing" | "cancelling" | "sent" | "failed" | "cancelled";

export interface ProviderOrderRow {
    id: string; integration_id: string; order_id: string; provider: string;
    external_id: string | null; status: ProviderOrderStatus; attempts: number;
    next_attempt_at: Date; payload: Record<string, unknown>; response: Record<string, unknown>;
    last_error: string | null; created_at: Date; updated_at: Date;
}

// Estado ANTES do claim virar 'processing' — é o que decide, no serviço, se
// a tentativa precisa cancelar no provider antes de criar (`cancelling`) ou
// só criar (`pending`). Ver orderPushService.dispatchOrderPushes.
export interface ClaimedProviderOrderRow extends ProviderOrderRow {
    previous_status: "pending" | "cancelling";
}

const fields = "id, integration_id, order_id, provider, external_id, status, attempts, next_attempt_at, payload, response, last_error, created_at, updated_at";

// DO UPDATE (sem alterar nada de fato) só para que ON CONFLICT continue
// devolvendo a linha via RETURNING quando ela já existe — enqueue chamado
// duas vezes para o mesmo pedido não deve resetar um envio já em andamento
// ou já concluído, só confirmar que a linha existe.
export async function insertProviderOrderRow(
    client: PoolClient,
    value: { integrationId: string; orderId: string; provider: string },
): Promise<ProviderOrderRow> {
    const result = await client.query<ProviderOrderRow>(
        `INSERT INTO provider_orders (tenant_id, integration_id, order_id, provider)
         VALUES (app_tenant_id(), $1, $2, $3)
         ON CONFLICT (tenant_id, order_id) DO UPDATE SET updated_at = provider_orders.updated_at
         RETURNING ${fields}`,
        [value.integrationId, value.orderId, value.provider],
    );
    return result.rows[0];
}

export async function findProviderOrderRowByOrderId(client: PoolClient, orderId: string): Promise<ProviderOrderRow | null> {
    const result = await client.query<ProviderOrderRow>(
        `SELECT ${fields} FROM provider_orders WHERE tenant_id = app_tenant_id() AND order_id = $1`,
        [orderId],
    );
    return result.rows[0] ?? null;
}

// Reivindica linhas prontas para tentar (pending ou cancelling, respeitando
// o backoff) e já marca 'processing' + incrementa attempts na mesma
// instrução -- mesmo padrão de claimPendingNotifications. `previous_status`
// vem do snapshot lido pelo SELECT da CTE (antes do UPDATE), não da linha
// pós-update: é assim que o chamador sabe qual das duas tentava.
export async function claimPendingProviderOrders(client: PoolClient, limit: number): Promise<ClaimedProviderOrderRow[]> {
    const result = await client.query<ClaimedProviderOrderRow>(
        `WITH picked AS (
           SELECT id, status FROM provider_orders
           WHERE tenant_id = app_tenant_id() AND status IN ('pending', 'cancelling') AND next_attempt_at <= now()
           ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT $1
         ) UPDATE provider_orders po SET status = 'processing', attempts = attempts + 1
           FROM picked WHERE po.id = picked.id
           RETURNING po.id, po.integration_id, po.order_id, po.provider, po.external_id,
             po.status, po.attempts, po.next_attempt_at, po.payload, po.response, po.last_error,
             po.created_at, po.updated_at, picked.status AS previous_status`,
        [limit],
    );
    return result.rows;
}

// Fecha uma tentativa de dispatch: `status` já é o próximo estado decidido
// pelo serviço ('sent'/'failed' terminam a tentativa; 'pending'/'cancelling'
// pedem retry). externalId é sempre passado explícito (nunca omitido) porque
// "sem mudança" e "limpar para null" (cancelamento bem-sucedido, sem criar
// de novo ainda) são casos distintos que só quem chamou sabe distinguir.
export async function finishProviderOrderAttempt(client: PoolClient, id: string, value: {
    status: ProviderOrderStatus; externalId: string | null;
    payload?: Record<string, unknown>; response?: Record<string, unknown>; error?: string | null;
}): Promise<void> {
    await client.query(
        `UPDATE provider_orders SET
           status = $2, external_id = $3,
           payload = COALESCE($4::jsonb, payload), response = COALESCE($5::jsonb, response),
           last_error = $6,
           next_attempt_at = CASE WHEN $2 IN ('pending', 'cancelling')
             THEN now() + (interval '1 minute' * LEAST(60, power(2, attempts))) ELSE next_attempt_at END,
           updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1`,
        [id, value.status, value.externalId, value.payload ? JSON.stringify(value.payload) : null,
         value.response ? JSON.stringify(value.response) : null, value.error ?? null],
    );
}

// Pede para uma linha existente ser reenviada: se ela tem external_id
// (já foi enviada com sucesso alguma vez), precisa cancelar antes de criar
// de novo -> 'cancelling'; senão só entra na fila normal -> 'pending'. Não
// mexe em linha 'processing' (dispatch em andamento agora) -- retorna null
// nesse caso, e quem chamou decide o que dizer ao usuário.
export async function markProviderOrderForResend(client: PoolClient, orderId: string): Promise<ProviderOrderRow | null> {
    const result = await client.query<ProviderOrderRow>(
        `UPDATE provider_orders SET
           status = CASE WHEN external_id IS NOT NULL THEN 'cancelling' ELSE 'pending' END,
           next_attempt_at = now(), updated_at = now()
         WHERE tenant_id = app_tenant_id() AND order_id = $1 AND status <> 'processing'
         RETURNING ${fields}`,
        [orderId],
    );
    return result.rows[0] ?? null;
}

// Cancelamento de PEDIDO (não resend): terminal, nunca recria em seguida --
// diferente de markProviderOrderForResend acima. Chamado só depois que o
// cancelamento no provider (se havia external_id) já foi tentado -- ver
// orderPushService.cancelProviderOrderForOrder. Não mexe em linha
// 'processing' pelo mesmo motivo do resend.
export async function markProviderOrderCancelled(client: PoolClient, orderId: string): Promise<ProviderOrderRow | null> {
    const result = await client.query<ProviderOrderRow>(
        `UPDATE provider_orders SET status = 'cancelled', external_id = NULL, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND order_id = $1 AND status <> 'processing'
         RETURNING ${fields}`,
        [orderId],
    );
    return result.rows[0] ?? null;
}
