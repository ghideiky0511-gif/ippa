import type { PoolClient } from "pg";

export type ProviderOrderAttemptOutcome = "sent" | "failed" | "retry_pending" | "retry_cancelling";

export interface ProviderOrderAttemptRow {
    id: string; provider_order_id: string; order_id: string; provider: string;
    attempt_number: number; outcome: ProviderOrderAttemptOutcome;
    external_id: string | null; error: string | null;
    payload: Record<string, unknown>; response: Record<string, unknown>;
    created_at: Date;
}

const fields = "id, provider_order_id, order_id, provider, attempt_number, outcome, external_id, error, payload, response, created_at";

export async function insertProviderOrderAttemptRow(client: PoolClient, value: {
    providerOrderId: string; orderId: string; provider: string; attemptNumber: number;
    outcome: ProviderOrderAttemptOutcome; externalId: string | null; error: string | null;
    payload?: Record<string, unknown>; response?: Record<string, unknown>;
}): Promise<ProviderOrderAttemptRow> {
    const result = await client.query<ProviderOrderAttemptRow>(
        `INSERT INTO provider_order_attempts
           (tenant_id, provider_order_id, order_id, provider, attempt_number, outcome, external_id, error, payload, response)
         VALUES (app_tenant_id(), $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
         RETURNING ${fields}`,
        [
            value.providerOrderId, value.orderId, value.provider, value.attemptNumber, value.outcome,
            value.externalId, value.error, JSON.stringify(value.payload ?? {}), JSON.stringify(value.response ?? {}),
        ],
    );
    return result.rows[0];
}

export async function listProviderOrderAttemptRowsByOrderId(client: PoolClient, orderId: string): Promise<ProviderOrderAttemptRow[]> {
    const result = await client.query<ProviderOrderAttemptRow>(
        `SELECT ${fields} FROM provider_order_attempts
         WHERE tenant_id = app_tenant_id() AND order_id = $1
         ORDER BY created_at DESC`,
        [orderId],
    );
    return result.rows;
}
