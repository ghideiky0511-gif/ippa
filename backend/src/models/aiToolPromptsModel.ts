import type { PoolClient } from "pg";

export type AiToolPromptVersionStatus = "draft" | "active" | "archived";

export interface AiToolPromptVersionRow {
    id: string;
    tenant_id: string;
    tool_key: string;
    version: number;
    instructions: string;
    status: AiToolPromptVersionStatus;
    created_by_platform_user_id: string | null;
    activated_by_platform_user_id: string | null;
    created_at: Date;
    activated_at: Date | null;
}

const promptVersionFields = `
    id, tenant_id, tool_key, version, instructions, status,
    created_by_platform_user_id, activated_by_platform_user_id,
    created_at, activated_at
`;

export async function findActiveAiToolPromptVersionRow(
    client: PoolClient,
    toolKey: string,
): Promise<AiToolPromptVersionRow | null> {
    const result = await client.query<AiToolPromptVersionRow>(
        `SELECT ${promptVersionFields}
         FROM ai_tool_prompt_versions
         WHERE tenant_id = app_tenant_id() AND tool_key = $1 AND status = 'active'
         LIMIT 1`,
        [toolKey],
    );
    return result.rows[0] ?? null;
}

export async function listControlAiToolPromptVersionRows(
    client: PoolClient,
    tenantId: string,
): Promise<AiToolPromptVersionRow[]> {
    const result = await client.query<AiToolPromptVersionRow>(
        `SELECT ${promptVersionFields}
         FROM ai_tool_prompt_versions
         WHERE tenant_id = $1
         ORDER BY tool_key, version DESC`,
        [tenantId],
    );
    return result.rows;
}

export async function insertControlAiToolPromptVersionRow(
    client: PoolClient,
    params: {
        tenantId: string;
        toolKey: string;
        instructions: string;
        platformUserId: string;
    },
): Promise<AiToolPromptVersionRow> {
    await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`${params.tenantId}:${params.toolKey}`],
    );
    const result = await client.query<AiToolPromptVersionRow>(
        `INSERT INTO ai_tool_prompt_versions (
            tenant_id, tool_key, version, instructions, status,
            created_by_platform_user_id
         )
         SELECT $1, $2, COALESCE(MAX(version), 0) + 1, $3, 'draft', $4
         FROM ai_tool_prompt_versions
         WHERE tenant_id = $1 AND tool_key = $2
         RETURNING ${promptVersionFields}`,
        [params.tenantId, params.toolKey, params.instructions, params.platformUserId],
    );
    return result.rows[0];
}

export async function findControlAiToolPromptVersionRow(
    client: PoolClient,
    tenantId: string,
    versionId: string,
): Promise<AiToolPromptVersionRow | null> {
    const result = await client.query<AiToolPromptVersionRow>(
        `SELECT ${promptVersionFields}
         FROM ai_tool_prompt_versions
         WHERE tenant_id = $1 AND id = $2
         FOR UPDATE`,
        [tenantId, versionId],
    );
    return result.rows[0] ?? null;
}

export async function activateControlAiToolPromptVersionRow(
    client: PoolClient,
    params: {
        tenantId: string;
        toolKey: string;
        versionId: string;
        platformUserId: string;
    },
): Promise<AiToolPromptVersionRow> {
    await client.query(
        `UPDATE ai_tool_prompt_versions
         SET status = 'archived'
         WHERE tenant_id = $1 AND tool_key = $2 AND status = 'active' AND id <> $3`,
        [params.tenantId, params.toolKey, params.versionId],
    );
    const result = await client.query<AiToolPromptVersionRow>(
        `UPDATE ai_tool_prompt_versions
         SET status = 'active', activated_at = now(),
             activated_by_platform_user_id = $4
         WHERE tenant_id = $1 AND tool_key = $2 AND id = $3
         RETURNING ${promptVersionFields}`,
        [params.tenantId, params.toolKey, params.versionId, params.platformUserId],
    );
    return result.rows[0];
}
