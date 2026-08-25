import type { PoolClient } from "pg";

export type AiToolExecutionStatus = "processing" | "succeeded" | "failed" | "cached";

export interface AiToolExecutionUsageRow {
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
}

export interface CachedAiToolExecutionRow {
    id: string;
    output: unknown;
}

interface AiToolExecutionIdentity {
    toolKey: string;
    toolVersion: string;
    provider: string;
    model: string;
    inputHash: string;
}

export async function findCachedAiToolExecutionRow(
    client: PoolClient,
    identity: AiToolExecutionIdentity & { completedAfter: Date },
): Promise<CachedAiToolExecutionRow | null> {
    const result = await client.query<{ id: string; output: unknown }>(
        `SELECT id, output FROM ai_tool_executions
         WHERE tenant_id = app_tenant_id()
           AND tool_key = $1 AND tool_version = $2 AND provider = $3
           AND model = $4 AND input_hash = $5 AND status = 'succeeded'
           AND completed_at >= $6 AND output IS NOT NULL
         ORDER BY completed_at DESC
         LIMIT 1`,
        [
            identity.toolKey,
            identity.toolVersion,
            identity.provider,
            identity.model,
            identity.inputHash,
            identity.completedAfter,
        ],
    );
    return result.rows[0] ?? null;
}

export async function insertProcessingAiToolExecutionRow(
    client: PoolClient,
    identity: AiToolExecutionIdentity & { actorId?: string; actorRole?: string },
): Promise<string> {
    const result = await client.query<{ id: string }>(
        `INSERT INTO ai_tool_executions (
            tenant_id, actor_id, actor_role, tool_key, tool_version,
            provider, model, input_hash, status
         ) VALUES (app_tenant_id(), $1, $2, $3, $4, $5, $6, $7, 'processing')
         RETURNING id`,
        [
            identity.actorId ?? null,
            identity.actorRole ?? null,
            identity.toolKey,
            identity.toolVersion,
            identity.provider,
            identity.model,
            identity.inputHash,
        ],
    );
    return result.rows[0].id;
}

export async function insertCachedAiToolExecutionRow(
    client: PoolClient,
    identity: AiToolExecutionIdentity & {
        actorId?: string;
        actorRole?: string;
        sourceExecutionId: string;
        durationMs: number;
    },
): Promise<string> {
    const result = await client.query<{ id: string }>(
        `INSERT INTO ai_tool_executions (
            tenant_id, actor_id, actor_role, tool_key, tool_version,
            provider, model, input_hash, status, source_execution_id,
            attempt_count, duration_ms, completed_at
         ) VALUES (
            app_tenant_id(), $1, $2, $3, $4, $5, $6, $7, 'cached', $8, 0, $9, now()
         ) RETURNING id`,
        [
            identity.actorId ?? null,
            identity.actorRole ?? null,
            identity.toolKey,
            identity.toolVersion,
            identity.provider,
            identity.model,
            identity.inputHash,
            identity.sourceExecutionId,
            identity.durationMs,
        ],
    );
    return result.rows[0].id;
}

export async function succeedAiToolExecutionRow(
    client: PoolClient,
    params: {
        id: string;
        output: unknown;
        providerResponseId?: string;
        attemptCount: number;
        usage?: AiToolExecutionUsageRow;
        durationMs: number;
    },
): Promise<void> {
    await client.query(
        `UPDATE ai_tool_executions
         SET status = 'succeeded', output = $2, provider_response_id = $3,
             attempt_count = $4, input_tokens = $5, output_tokens = $6,
             cached_input_tokens = $7, duration_ms = $8, error_code = NULL,
             completed_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1`,
        [
            params.id,
            JSON.stringify(params.output),
            params.providerResponseId ?? null,
            params.attemptCount,
            params.usage?.inputTokens ?? null,
            params.usage?.outputTokens ?? null,
            params.usage?.cachedInputTokens ?? null,
            params.durationMs,
        ],
    );
}

export async function failAiToolExecutionRow(
    client: PoolClient,
    params: {
        id: string;
        errorCode: string;
        providerResponseId?: string;
        attemptCount: number;
        usage?: AiToolExecutionUsageRow;
        durationMs: number;
    },
): Promise<void> {
    await client.query(
        `UPDATE ai_tool_executions
         SET status = 'failed', provider_response_id = $2, attempt_count = $3,
             input_tokens = $4, output_tokens = $5, cached_input_tokens = $6,
             duration_ms = $7, error_code = $8, completed_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1`,
        [
            params.id,
            params.providerResponseId ?? null,
            params.attemptCount,
            params.usage?.inputTokens ?? null,
            params.usage?.outputTokens ?? null,
            params.usage?.cachedInputTokens ?? null,
            params.durationMs,
            params.errorCode,
        ],
    );
}

export async function deleteExpiredAiToolExecutionRows(
    client: PoolClient,
    createdBefore: Date,
): Promise<number> {
    const result = await client.query(
        `DELETE FROM ai_tool_executions
         WHERE tenant_id = app_tenant_id() AND created_at < $1`,
        [createdBefore],
    );
    return result.rowCount ?? 0;
}
