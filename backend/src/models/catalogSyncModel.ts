import type { PoolClient } from "pg";

export type CatalogSyncMode = "incremental" | "full";
export type CatalogSyncRunStatus = "discovering" | "processing" | "partial" | "succeeded" | "failed";

export interface CatalogSyncConfigRow {
    integration_id: string;
    enabled: boolean;
    classification_type_code: number | null;
    classification_codes: string[];
    poll_interval_seconds: number;
    overlap_seconds: number;
}

export interface CatalogSyncStateRow {
    integration_id: string;
    checkpoint_at: Date | null;
    next_incremental_at: Date;
    last_full_sync_at: Date | null;
    lease_token: string | null;
    lease_until: Date | null;
}

export interface CatalogSyncRunRow {
    id: string;
    integration_id: string;
    mode: CatalogSyncMode;
    status: CatalogSyncRunStatus;
    window_start: Date | null;
    window_end: Date | null;
}

export interface CatalogSyncItemRow {
    id: string;
    integration_id: string;
    run_id: string;
    reference_code: string;
    status: "pending" | "processing" | "succeeded" | "failed";
    attempts: number;
}

export async function upsertCatalogSyncConfigRow(
    client: PoolClient,
    value: {
        integrationId: string;
        enabled: boolean;
        classificationTypeCode?: number;
        classificationCodes: string[];
    },
): Promise<void> {
    await client.query(
        `INSERT INTO catalog_sync_configs (
           tenant_id, integration_id, enabled, classification_type_code, classification_codes
         ) VALUES (app_tenant_id(), $1, $2, $3, $4)
         ON CONFLICT (tenant_id, integration_id) DO UPDATE SET
           enabled = EXCLUDED.enabled,
           classification_type_code = EXCLUDED.classification_type_code,
           classification_codes = EXCLUDED.classification_codes,
           updated_at = now()`,
        [value.integrationId, value.enabled, value.classificationTypeCode ?? null, value.classificationCodes],
    );
}

export async function findCatalogSyncConfigRow(
    client: PoolClient,
    integrationId: string,
): Promise<CatalogSyncConfigRow | null> {
    const result = await client.query<CatalogSyncConfigRow>(
        `SELECT integration_id, enabled, classification_type_code, classification_codes,
                poll_interval_seconds, overlap_seconds
         FROM catalog_sync_configs
         WHERE tenant_id = app_tenant_id() AND integration_id = $1`,
        [integrationId],
    );
    return result.rows[0] ?? null;
}

export async function ensureCatalogSyncStateRow(
    client: PoolClient,
    integrationId: string,
): Promise<CatalogSyncStateRow> {
    const result = await client.query<CatalogSyncStateRow>(
        `INSERT INTO catalog_sync_states (tenant_id, integration_id)
         VALUES (app_tenant_id(), $1)
         ON CONFLICT (tenant_id, integration_id) DO UPDATE SET integration_id = EXCLUDED.integration_id
         RETURNING integration_id, checkpoint_at, next_incremental_at, last_full_sync_at,
                   lease_token, lease_until`,
        [integrationId],
    );
    return result.rows[0];
}

export async function acquireCatalogSyncLeaseRow(
    client: PoolClient,
    integrationId: string,
    leaseToken: string,
    durationSeconds = 900,
): Promise<boolean> {
    const result = await client.query(
        `UPDATE catalog_sync_states SET
           lease_token = $2::uuid,
           lease_until = now() + make_interval(secs => $3),
           updated_at = now()
         WHERE tenant_id = app_tenant_id() AND integration_id = $1
           AND (lease_until IS NULL OR lease_until < now() OR lease_token = $2::uuid)`,
        [integrationId, leaseToken, durationSeconds],
    );
    return (result.rowCount ?? 0) === 1;
}

export async function releaseCatalogSyncLeaseRow(
    client: PoolClient,
    integrationId: string,
    leaseToken: string,
    error?: string,
): Promise<void> {
    await client.query(
        `UPDATE catalog_sync_states SET
           lease_token = NULL, lease_until = NULL, last_error = $3, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND integration_id = $1 AND lease_token = $2::uuid`,
        [integrationId, leaseToken, error ?? null],
    );
}

export async function insertCatalogSyncRunRow(
    client: PoolClient,
    value: { integrationId: string; mode: CatalogSyncMode; windowStart?: Date; windowEnd?: Date },
): Promise<CatalogSyncRunRow> {
    const result = await client.query<CatalogSyncRunRow>(
        `INSERT INTO catalog_sync_runs (
           tenant_id, integration_id, mode, window_start, window_end
         ) VALUES (app_tenant_id(), $1, $2, $3, $4)
         RETURNING id, integration_id, mode, status, window_start, window_end`,
        [value.integrationId, value.mode, value.windowStart ?? null, value.windowEnd ?? null],
    );
    return result.rows[0];
}

export async function findOpenFullCatalogSyncRunRow(
    client: PoolClient,
    integrationId: string,
): Promise<CatalogSyncRunRow | null> {
    const result = await client.query<CatalogSyncRunRow>(
        `SELECT id, integration_id, mode, status, window_start, window_end
         FROM catalog_sync_runs
         WHERE tenant_id = app_tenant_id() AND integration_id = $1
           AND mode = 'full' AND status IN ('discovering', 'processing', 'partial')
         ORDER BY started_at
         LIMIT 1`,
        [integrationId],
    );
    return result.rows[0] ?? null;
}

export async function stageCatalogSyncItemsRow(
    client: PoolClient,
    runId: string,
    integrationId: string,
    referenceCodes: string[],
): Promise<number> {
    if (referenceCodes.length === 0) return 0;
    const result = await client.query(
        `INSERT INTO catalog_sync_items (
           tenant_id, integration_id, run_id, reference_code
         )
         SELECT app_tenant_id(), $2, $1, code
         FROM unnest($3::text[]) AS code
         WHERE btrim(code) <> ''
         ON CONFLICT (tenant_id, run_id, reference_code) DO NOTHING`,
        [runId, integrationId, referenceCodes],
    );
    await client.query(
        `UPDATE catalog_sync_runs SET discovered_count = (
           SELECT count(*) FROM catalog_sync_items
           WHERE tenant_id = app_tenant_id() AND run_id = $1
         ), updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1`,
        [runId],
    );
    return result.rowCount ?? 0;
}

export async function markCatalogDiscoveryCompleteRow(
    client: PoolClient,
    value: {
        runId: string;
        integrationId: string;
        mode: CatalogSyncMode;
        checkpointAt: Date;
        pollIntervalSeconds: number;
    },
): Promise<void> {
    await client.query(
        `UPDATE catalog_sync_runs SET status = 'processing', updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1`,
        [value.runId],
    );
    await client.query(
        `UPDATE catalog_sync_states SET
           checkpoint_at = $2,
           next_incremental_at = now() + make_interval(secs => $3),
           updated_at = now()
         WHERE tenant_id = app_tenant_id() AND integration_id = $1`,
        [value.integrationId, value.checkpointAt, value.pollIntervalSeconds],
    );
}

export async function claimDueCatalogSyncItemsRow(
    client: PoolClient,
    integrationId: string,
    limit = 500,
): Promise<CatalogSyncItemRow[]> {
    const result = await client.query<CatalogSyncItemRow>(
        `WITH due AS (
           SELECT id FROM catalog_sync_items
           WHERE tenant_id = app_tenant_id() AND integration_id = $1
             AND status = 'pending' AND next_attempt_at <= now()
           ORDER BY next_attempt_at, created_at
           LIMIT $2
           FOR UPDATE SKIP LOCKED
         )
         UPDATE catalog_sync_items item SET status = 'processing', updated_at = now()
         FROM due WHERE item.id = due.id
         RETURNING item.id, item.integration_id, item.run_id, item.reference_code,
                   item.status, item.attempts`,
        [integrationId, limit],
    );
    return result.rows;
}

export async function completeCatalogSyncItemRow(
    client: PoolClient,
    itemId: string,
): Promise<void> {
    await client.query(
        `UPDATE catalog_sync_items SET status = 'succeeded', last_error = NULL, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1`,
        [itemId],
    );
}

export async function retryCatalogSyncItemRow(
    client: PoolClient,
    itemId: string,
    error: string,
    retryDelaySeconds: number | null,
): Promise<void> {
    await client.query(
        `UPDATE catalog_sync_items SET
           attempts = attempts + 1,
           status = CASE WHEN $3::integer IS NULL OR attempts + 1 >= 6 THEN 'failed' ELSE 'pending' END,
           next_attempt_at = CASE WHEN $3::integer IS NULL THEN next_attempt_at
                                  ELSE now() + make_interval(secs => $3) END,
           last_error = left($2, 2000), updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1`,
        [itemId, error, retryDelaySeconds],
    );
}

export async function listFinalizableCatalogSyncRunsRow(
    client: PoolClient,
    integrationId: string,
): Promise<Array<CatalogSyncRunRow & { failed_count: number }>> {
    const result = await client.query<CatalogSyncRunRow & { failed_count: number }>(
        `SELECT run.id, run.integration_id, run.mode, run.status,
                run.window_start, run.window_end,
                count(*) FILTER (WHERE item.status = 'failed')::integer AS failed_count
         FROM catalog_sync_runs run
         LEFT JOIN catalog_sync_items item
           ON item.tenant_id = run.tenant_id AND item.run_id = run.id
         WHERE run.tenant_id = app_tenant_id() AND run.integration_id = $1
           AND run.status IN ('processing', 'partial')
         GROUP BY run.id
         HAVING count(*) FILTER (WHERE item.status IN ('pending', 'processing')) = 0`,
        [integrationId],
    );
    return result.rows;
}

export async function finishCatalogSyncRunRow(
    client: PoolClient,
    runId: string,
    succeeded: boolean,
): Promise<void> {
    await client.query(
        `UPDATE catalog_sync_runs run SET
           status = $2, finished_at = now(), updated_at = now(),
           processed_count = stats.processed_count,
           failed_count = stats.failed_count
         FROM (
           SELECT count(*) FILTER (WHERE status = 'succeeded')::integer AS processed_count,
                  count(*) FILTER (WHERE status = 'failed')::integer AS failed_count
           FROM catalog_sync_items
           WHERE tenant_id = app_tenant_id() AND run_id = $1
         ) stats
         WHERE run.tenant_id = app_tenant_id() AND run.id = $1`,
        [runId, succeeded ? "succeeded" : "failed"],
    );
}

export async function markCatalogSyncRunFailedRow(
    client: PoolClient,
    runId: string,
    error: string,
): Promise<void> {
    await client.query(
        `UPDATE catalog_sync_runs SET status = 'failed', error_message = left($2, 2000),
                finished_at = now(), updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1`,
        [runId, error],
    );
}

export async function markFullSyncCompletedRow(
    client: PoolClient,
    integrationId: string,
): Promise<void> {
    await client.query(
        `UPDATE catalog_sync_states SET last_full_sync_at = now(), updated_at = now()
         WHERE tenant_id = app_tenant_id() AND integration_id = $1`,
        [integrationId],
    );
}

export async function deactivateProductsNotSeenInFullRunRow(
    client: PoolClient,
    integrationId: string,
    runId: string,
): Promise<void> {
    await client.query(
        `UPDATE products product SET is_active = false, source_origin = 'erp', updated_at = now()
         WHERE product.tenant_id = app_tenant_id()
           AND (
             product.source_origin = 'bootstrap'
             OR EXISTS (
               SELECT 1 FROM erp_external_references reference
               WHERE reference.tenant_id = product.tenant_id
                 AND reference.integration_id = $1
                 AND reference.entity_type = 'product'
                 AND reference.internal_id = product.id
                 AND reference.metadata->>'lastFullRunId' IS DISTINCT FROM $2
             )
           )`,
        [integrationId, runId],
    );
    await client.query(
        `UPDATE product_variants variant SET is_active = false, availability = 'out_of_stock'
         FROM products product
         WHERE variant.tenant_id = app_tenant_id() AND product.id = variant.product_id
           AND product.tenant_id = variant.tenant_id AND NOT product.is_active`,
    );
}
