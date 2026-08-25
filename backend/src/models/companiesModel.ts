import type { PoolClient } from "pg";

export interface CompanyRow {
    id: string; cnpj: string; razao_social: string; nome_fantasia: string | null;
    inscricao_estadual: string | null; is_matriz: boolean;
    cep: string | null; street: string | null; number: string | null;
    complement: string | null; neighborhood: string | null; city: string | null;
    state: string | null; active: boolean; created_at: Date; updated_at: Date;
}

export interface CompanyWriteRow {
    cnpj: string; razaoSocial: string; nomeFantasia?: string; inscricaoEstadual?: string;
    isMatriz?: boolean; cep?: string; street?: string; number?: string; complement?: string;
    neighborhood?: string; city?: string; state?: string; active?: boolean;
}

const companyFields =
    "id, cnpj, razao_social, nome_fantasia, inscricao_estadual, is_matriz, cep, street, number, complement, neighborhood, city, state, active, created_at, updated_at";

export async function listCompanyRows(client: PoolClient): Promise<CompanyRow[]> {
    const result = await client.query<CompanyRow>(
        `SELECT ${companyFields} FROM companies WHERE tenant_id = app_tenant_id() ORDER BY razao_social`,
    );
    return result.rows;
}

export async function findCompanyRow(client: PoolClient, id: string): Promise<CompanyRow | null> {
    const result = await client.query<CompanyRow>(
        `SELECT ${companyFields} FROM companies WHERE tenant_id = app_tenant_id() AND id = $1`, [id],
    );
    return result.rows[0] ?? null;
}

export async function findCompanyRowByCnpj(client: PoolClient, cnpj: string): Promise<CompanyRow | null> {
    const result = await client.query<CompanyRow>(
        `SELECT ${companyFields} FROM companies WHERE tenant_id = app_tenant_id() AND cnpj = $1`, [cnpj],
    );
    return result.rows[0] ?? null;
}

export async function insertCompanyRow(client: PoolClient, value: CompanyWriteRow): Promise<CompanyRow> {
    const result = await client.query<CompanyRow>(
        `INSERT INTO companies (tenant_id, cnpj, razao_social, nome_fantasia, inscricao_estadual, is_matriz, cep, street, number, complement, neighborhood, city, state, active)
         VALUES (app_tenant_id(), $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING ${companyFields}`,
        [value.cnpj, value.razaoSocial, value.nomeFantasia ?? null, value.inscricaoEstadual ?? null,
         value.isMatriz ?? false, value.cep ?? null, value.street ?? null, value.number ?? null,
         value.complement ?? null, value.neighborhood ?? null, value.city ?? null, value.state ?? null,
         value.active ?? true],
    );
    return result.rows[0];
}

export async function updateCompanyRow(client: PoolClient, id: string, value: Partial<CompanyWriteRow>): Promise<CompanyRow | null> {
    const result = await client.query<CompanyRow>(
        `UPDATE companies SET razao_social = COALESCE($2, razao_social), nome_fantasia = $3, inscricao_estadual = $4,
           is_matriz = COALESCE($5, is_matriz), cep = $6, street = $7, number = $8, complement = $9,
           neighborhood = $10, city = $11, state = $12, active = COALESCE($13, active), updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1 RETURNING ${companyFields}`,
        [id, value.razaoSocial ?? null, value.nomeFantasia ?? null, value.inscricaoEstadual ?? null,
         value.isMatriz ?? null, value.cep ?? null, value.street ?? null, value.number ?? null,
         value.complement ?? null, value.neighborhood ?? null, value.city ?? null, value.state ?? null,
         value.active ?? null],
    );
    return result.rows[0] ?? null;
}
