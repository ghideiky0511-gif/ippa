import type { PoolClient } from "pg";

// payment_webhook_events (migration 044) é append-only: só GRANT SELECT,
// INSERT pra ippa_app (sem UPDATE/DELETE) -- por isso uma linha nasce já
// com o resultado decidido (processed_at OU processing_error, nunca os
// dois nem nenhum), diferente de "insere pendente, atualiza depois". Uma
// redelivery de evento que falhou antes grava uma NOVA linha (ver
// hasProcessedPaymentWebhookEvent abaixo), não corrige a antiga.

export interface InsertPaymentWebhookEventRow {
    provider: string;
    externalEventId?: string;
    chargeId?: string;
    eventType: string;
    signatureValid: boolean;
    payload: Record<string, unknown>;
    processedAt?: Date;
    processingError?: string;
}

export async function insertPaymentWebhookEventRow(
    client: PoolClient,
    value: InsertPaymentWebhookEventRow,
): Promise<void> {
    await client.query(
        `INSERT INTO payment_webhook_events
           (tenant_id, provider, external_event_id, charge_id, event_type, signature_valid, payload, processed_at, processing_error)
         VALUES (app_tenant_id(), $1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
        [
            value.provider,
            value.externalEventId ?? null,
            value.chargeId ?? null,
            value.eventType,
            value.signatureValid,
            JSON.stringify(value.payload),
            value.processedAt ?? null,
            value.processingError ?? null,
        ],
    );
}

// Único ponto de idempotência real de "já vimos este evento": só um evento
// que já foi processado COM SUCESSO conta como duplicata de verdade -- uma
// linha anterior com processing_error preenchido (processed_at NULL) deixa
// passar pra reprocessar (correção de um bug observado num app de
// referência, onde qualquer linha existente bloqueava reprocessamento pra
// sempre, mesmo depois de um erro transitório).
export async function hasProcessedPaymentWebhookEvent(
    client: PoolClient,
    provider: string,
    externalEventId: string,
): Promise<boolean> {
    const result = await client.query(
        `SELECT 1 FROM payment_webhook_events
         WHERE tenant_id = app_tenant_id() AND provider = $1 AND external_event_id = $2 AND processed_at IS NOT NULL
         LIMIT 1`,
        [provider, externalEventId],
    );
    return (result.rowCount ?? 0) > 0;
}
