import type { PoolClient } from "pg";

export interface CommercialGroupRow {
    id: string; name: string; group_type: string; is_active: boolean;
    created_at: Date; updated_at: Date;
}

export interface CommercialGroupWriteRow {
    name: string;
}

const commercialGroupFields = "id, name, group_type, is_active, created_at, updated_at";

export async function listCommercialGroupRows(client: PoolClient, search: string | null, includeInactive: boolean): Promise<CommercialGroupRow[]> {
    const result = await client.query<CommercialGroupRow>(
        `SELECT ${commercialGroupFields} FROM commercial_groups
         WHERE tenant_id = app_tenant_id()
           AND ($1::boolean OR is_active)
           AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%')
         ORDER BY name`,
        [includeInactive, search],
    );
    return result.rows;
}

export async function findCommercialGroupRow(client: PoolClient, id: string): Promise<CommercialGroupRow | null> {
    const result = await client.query<CommercialGroupRow>(
        `SELECT ${commercialGroupFields} FROM commercial_groups WHERE tenant_id = app_tenant_id() AND id = $1`, [id],
    );
    return result.rows[0] ?? null;
}

export async function insertCommercialGroupRow(client: PoolClient, value: CommercialGroupWriteRow): Promise<CommercialGroupRow> {
    const result = await client.query<CommercialGroupRow>(
        `INSERT INTO commercial_groups (tenant_id, name)
         VALUES (app_tenant_id(), $1)
         RETURNING ${commercialGroupFields}`,
        [value.name],
    );
    return result.rows[0];
}

export async function updateCommercialGroupRow(client: PoolClient, id: string, value: Partial<CommercialGroupWriteRow>): Promise<CommercialGroupRow | null> {
    const result = await client.query<CommercialGroupRow>(
        `UPDATE commercial_groups SET name = COALESCE($2, name), updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1 RETURNING ${commercialGroupFields}`,
        [id, value.name ?? null],
    );
    return result.rows[0] ?? null;
}

// Update de coluna única dedicado — updateCommercialGroupRow acima não deve
// ser reaproveitado pra ativar/desativar (evita reescrever o resto do
// cadastro por engano quando só a flag muda).
export async function setCommercialGroupActiveRow(client: PoolClient, id: string, isActive: boolean): Promise<CommercialGroupRow | null> {
    const result = await client.query<CommercialGroupRow>(
        `UPDATE commercial_groups SET is_active = $2, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1 RETURNING ${commercialGroupFields}`,
        [id, isActive],
    );
    return result.rows[0] ?? null;
}
