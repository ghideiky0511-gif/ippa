import type { PoolClient } from "pg";

export type ExternalApiProviderStatusValue =
    | "operacional"
    | "degradado"
    | "indisponivel"
    | "manutencao"
    | "desconhecido";

export interface ExternalApiRequestLogRow {
    id: string;
    provider: string;
    operation: string;
    method: string;
    endpoint: string;
    endpoint_path: string | null;
    status_code: number | null;
    success: boolean;
    attempt_count: number;
    wait_ms: number;
    duration_ms: number;
    created_at: Date;
}

export interface ExternalApiProviderStatusRow {
    provider: string;
    status: ExternalApiProviderStatusValue;
    last_success_at: Date | null;
    last_error_at: Date | null;
    last_error_code: string | null;
    last_error_summary: string | null;
    last_request_log_id: string | null;
    expected_back_online_at: Date | null;
    public_message: string | null;
    created_at: Date;
    updated_at: Date;
}

export async function insertExternalApiRequestLogRow(client: PoolClient, params: {
    provider: string; operation: string; method: string; endpoint: string; endpointPath: string | null;
    statusCode: number | null; success: boolean; attemptCount: number; waitMs: number; durationMs: number;
    requestPayload: unknown; responseBody: string | null; errorMessage: string | null; errorClass: string | null;
}): Promise<string> {
    const result = await client.query<{ id: string }>(
        `INSERT INTO external_api_request_log (
            tenant_id, provider, operation, method, endpoint, endpoint_path, status_code, success,
            attempt_count, wait_ms, duration_ms, request_payload, response_body, error_message, error_class
         ) VALUES (app_tenant_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING id`,
        [
            params.provider, params.operation, params.method, params.endpoint, params.endpointPath,
            params.statusCode, params.success, params.attemptCount, params.waitMs, params.durationMs,
            params.requestPayload !== null ? JSON.stringify(params.requestPayload) : null,
            params.responseBody, params.errorMessage, params.errorClass,
        ],
    );
    return result.rows[0].id;
}

export async function findProviderStatusRowForUpdate(client: PoolClient, provider: string): Promise<{
    status: ExternalApiProviderStatusValue; last_error_code: string | null;
} | null> {
    const result = await client.query<{ status: ExternalApiProviderStatusValue; last_error_code: string | null }>(
        `SELECT status, last_error_code FROM external_api_provider_status
         WHERE tenant_id = app_tenant_id() AND provider = $1
         FOR UPDATE`,
        [provider],
    );
    return result.rows[0] ?? null;
}

export async function upsertProviderStatusOperationalRow(client: PoolClient, params: {
    provider: string; lastSuccessAt: Date; lastRequestLogId: string | null;
}): Promise<void> {
    await client.query(
        `INSERT INTO external_api_provider_status (tenant_id, provider, status, last_success_at, last_request_log_id, updated_at)
         VALUES (app_tenant_id(), $1, 'operacional', $2, $3, now())
         ON CONFLICT (tenant_id, provider) DO UPDATE SET
           status = EXCLUDED.status,
           last_success_at = COALESCE(EXCLUDED.last_success_at, external_api_provider_status.last_success_at),
           last_request_log_id = COALESCE(EXCLUDED.last_request_log_id, external_api_provider_status.last_request_log_id),
           updated_at = EXCLUDED.updated_at`,
        [params.provider, params.lastSuccessAt, params.lastRequestLogId],
    );
}

export async function upsertProviderStatusProblemRow(client: PoolClient, params: {
    provider: string; status: ExternalApiProviderStatusValue; lastErrorAt: Date;
    lastErrorCode: string | null; lastErrorSummary: string | null; lastRequestLogId: string | null;
    publicMessage: string | null;
}): Promise<void> {
    await client.query(
        `INSERT INTO external_api_provider_status (
            tenant_id, provider, status, last_error_at, last_error_code, last_error_summary,
            last_request_log_id, public_message, updated_at
         ) VALUES (app_tenant_id(), $1, $2, $3, $4, $5, $6, $7, now())
         ON CONFLICT (tenant_id, provider) DO UPDATE SET
           status = EXCLUDED.status,
           last_error_at = EXCLUDED.last_error_at,
           last_error_code = EXCLUDED.last_error_code,
           last_error_summary = EXCLUDED.last_error_summary,
           last_request_log_id = EXCLUDED.last_request_log_id,
           public_message = EXCLUDED.public_message,
           updated_at = EXCLUDED.updated_at`,
        [params.provider, params.status, params.lastErrorAt, params.lastErrorCode, params.lastErrorSummary,
         params.lastRequestLogId, params.publicMessage],
    );
}

const providerStatusFields = `provider, status, last_success_at, last_error_at, last_error_code, last_error_summary,
    last_request_log_id, expected_back_online_at, public_message, created_at, updated_at`;

export async function listProviderStatusRows(client: PoolClient, provider?: string): Promise<ExternalApiProviderStatusRow[]> {
    const result = await client.query<ExternalApiProviderStatusRow>(
        `SELECT ${providerStatusFields} FROM external_api_provider_status
         WHERE tenant_id = app_tenant_id() AND ($1::text IS NULL OR provider = $1)
         ORDER BY provider ASC`,
        [provider ?? null],
    );
    return result.rows;
}
