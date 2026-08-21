import type { PoolClient } from "pg";

export type ErpEntityType = "product" | "order" | "client" | "company";

export interface ErpExternalReferenceRow {
    id: string; integration_id: string; entity_type: ErpEntityType;
    internal_id: string; external_id: string; metadata: Record<string, unknown>;
    created_at: Date; updated_at: Date;
}

export async function findInternalIdByExternalId(
    client: PoolClient,
    integrationId: string,
    entityType: ErpEntityType,
    externalId: string,
): Promise<string | null> {
    const result = await client.query<{ internal_id: string }>(
        `SELECT internal_id FROM erp_external_references
         WHERE tenant_id = app_tenant_id() AND integration_id = $1 AND entity_type = $2 AND external_id = $3`,
        [integrationId, entityType, externalId],
    );
    return result.rows[0]?.internal_id ?? null;
}

export async function findExternalIdByInternalId(
    client: PoolClient,
    integrationId: string,
    entityType: ErpEntityType,
    internalId: string,
): Promise<string | null> {
    const result = await client.query<{ external_id: string }>(
        `SELECT external_id FROM erp_external_references
         WHERE tenant_id = app_tenant_id() AND integration_id = $1 AND entity_type = $2 AND internal_id = $3`,
        [integrationId, entityType, internalId],
    );
    return result.rows[0]?.external_id ?? null;
}

export async function upsertExternalReferenceRow(
    client: PoolClient,
    value: { integrationId: string; entityType: ErpEntityType; internalId: string; externalId: string; metadata?: Record<string, unknown> },
): Promise<ErpExternalReferenceRow> {
    const result = await client.query<ErpExternalReferenceRow>(
        `INSERT INTO erp_external_references (tenant_id, integration_id, entity_type, internal_id, external_id, metadata)
         VALUES (app_tenant_id(), $1, $2, $3, $4, $5)
         ON CONFLICT (tenant_id, integration_id, entity_type, external_id)
         DO UPDATE SET internal_id = EXCLUDED.internal_id, metadata = EXCLUDED.metadata, updated_at = now()
         RETURNING id, integration_id, entity_type, internal_id, external_id, metadata, created_at, updated_at`,
        [value.integrationId, value.entityType, value.internalId, value.externalId, JSON.stringify(value.metadata ?? {})],
    );
    return result.rows[0];
}
