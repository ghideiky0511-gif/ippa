import type { PoolClient } from "pg";

export interface CommercialGroupMemberRow {
    id: string; group_id: string; client_id: string;
    is_primary: boolean; is_active: boolean; created_at: Date; updated_at: Date;
}

export interface CommercialGroupMemberWriteRow {
    groupId: string; clientId: string; isPrimary?: boolean;
}

const commercialGroupMemberFields = "id, group_id, client_id, is_primary, is_active, created_at, updated_at";

export async function listCommercialGroupMemberRows(client: PoolClient, groupId: string, includeInactive: boolean): Promise<CommercialGroupMemberRow[]> {
    const result = await client.query<CommercialGroupMemberRow>(
        `SELECT ${commercialGroupMemberFields} FROM commercial_group_members
         WHERE tenant_id = app_tenant_id()
           AND group_id = $1
           AND ($2::boolean OR is_active)
         ORDER BY is_primary DESC, created_at ASC`,
        [groupId, includeInactive],
    );
    return result.rows;
}

// Inclui membros inativos de propósito: é a checagem usada pra decidir
// entre inserir uma linha nova ou reativar a que já existe pro par
// (group, client) — ver UNIQUE (tenant_id, group_id, client_id).
export async function findCommercialGroupMemberRow(client: PoolClient, groupId: string, clientId: string): Promise<CommercialGroupMemberRow | null> {
    const result = await client.query<CommercialGroupMemberRow>(
        `SELECT ${commercialGroupMemberFields} FROM commercial_group_members
         WHERE tenant_id = app_tenant_id() AND group_id = $1 AND client_id = $2`,
        [groupId, clientId],
    );
    return result.rows[0] ?? null;
}

export async function findActiveCommercialGroupMembershipByClientRow(client: PoolClient, clientId: string): Promise<CommercialGroupMemberRow | null> {
    const result = await client.query<CommercialGroupMemberRow>(
        `SELECT ${commercialGroupMemberFields} FROM commercial_group_members
         WHERE tenant_id = app_tenant_id() AND client_id = $1 AND is_active = TRUE`,
        [clientId],
    );
    return result.rows[0] ?? null;
}

// Lookup em lote — usado pelo talão pra agrupar sessões de matriz/filiais
// abertas ao mesmo tempo (ver TalaoProvider.tsx) sem uma query por cliente.
export async function listActiveCommercialGroupMembershipsByClientIdsRow(client: PoolClient, clientIds: string[]): Promise<CommercialGroupMemberRow[]> {
    if (clientIds.length === 0) return [];
    const result = await client.query<CommercialGroupMemberRow>(
        `SELECT ${commercialGroupMemberFields} FROM commercial_group_members
         WHERE tenant_id = app_tenant_id() AND client_id = ANY($1::uuid[]) AND is_active = TRUE`,
        [clientIds],
    );
    return result.rows;
}

export async function insertCommercialGroupMemberRow(client: PoolClient, value: CommercialGroupMemberWriteRow): Promise<CommercialGroupMemberRow> {
    const result = await client.query<CommercialGroupMemberRow>(
        `INSERT INTO commercial_group_members (tenant_id, group_id, client_id, is_primary, is_active)
         VALUES (app_tenant_id(), $1, $2, $3, TRUE)
         RETURNING ${commercialGroupMemberFields}`,
        [value.groupId, value.clientId, value.isPrimary ?? false],
    );
    return result.rows[0];
}

// Reativa uma linha existente (removida antes) em vez de inserir de novo —
// ver UNIQUE (tenant_id, group_id, client_id) na migration.
export async function reactivateCommercialGroupMemberRow(client: PoolClient, id: string, isPrimary: boolean): Promise<CommercialGroupMemberRow | null> {
    const result = await client.query<CommercialGroupMemberRow>(
        `UPDATE commercial_group_members SET is_active = TRUE, is_primary = $2, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1 RETURNING ${commercialGroupMemberFields}`,
        [id, isPrimary],
    );
    return result.rows[0] ?? null;
}

export async function deactivateCommercialGroupMemberRow(client: PoolClient, id: string): Promise<CommercialGroupMemberRow | null> {
    const result = await client.query<CommercialGroupMemberRow>(
        `UPDATE commercial_group_members SET is_active = FALSE, is_primary = FALSE, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1 RETURNING ${commercialGroupMemberFields}`,
        [id],
    );
    return result.rows[0] ?? null;
}

export async function deactivateAllCommercialGroupMemberRowsForGroup(client: PoolClient, groupId: string): Promise<void> {
    await client.query(
        `UPDATE commercial_group_members SET is_active = FALSE, is_primary = FALSE, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND group_id = $1 AND is_active = TRUE`,
        [groupId],
    );
}

// Precisa rodar antes de marcar um novo membro como principal — o índice
// parcial exige no máximo um is_primary=true ativo por grupo.
export async function clearPrimaryCommercialGroupMemberRow(client: PoolClient, groupId: string): Promise<void> {
    await client.query(
        `UPDATE commercial_group_members SET is_primary = FALSE, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND group_id = $1 AND is_primary = TRUE`,
        [groupId],
    );
}

export async function setCommercialGroupMemberPrimaryRow(client: PoolClient, id: string, isPrimary: boolean): Promise<CommercialGroupMemberRow | null> {
    const result = await client.query<CommercialGroupMemberRow>(
        `UPDATE commercial_group_members SET is_primary = $2, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1 RETURNING ${commercialGroupMemberFields}`,
        [id, isPrimary],
    );
    return result.rows[0] ?? null;
}
