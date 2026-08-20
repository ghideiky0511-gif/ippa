import type { PoolClient } from "pg";
import type { CartItem } from "@/lib/types";

export interface ClientRow {
    id: string; name: string; cpf_cnpj: string | null; email: string | null;
    cep: string | null; street: string | null; number: string | null;
    complement: string | null; neighborhood: string | null; city: string | null;
    state: string | null; company_responsible: string | null; store_name: string | null;
    last_seller_id: string | null; created_at: Date; updated_at: Date;
}

export interface ClientWriteRow {
    name: string; cpfCnpj?: string; email?: string; cep?: string; street?: string;
    number?: string; complement?: string; neighborhood?: string; city?: string;
    state?: string; companyResponsible?: string; storeName?: string; lastSellerId?: string;
}

const clientFields =
    "id, name, cpf_cnpj, email, cep, street, number, complement, neighborhood, city, state, company_responsible, store_name, last_seller_id, created_at, updated_at";

export interface ClientSearchPage {
    rows: ClientRow[];
    total: number;
    newThisMonth: number;
    withEmail: number;
    withAddress: number;
}

export async function searchClientRows(client: PoolClient, search: string | null): Promise<ClientRow[]> {
    const result = await client.query<ClientRow>(
        `SELECT ${clientFields} FROM clients
         WHERE tenant_id = app_tenant_id()
           AND ($1::text IS NULL OR name ILIKE '%' || $1 || '%' OR cpf_cnpj ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%')
         ORDER BY name LIMIT 20`, [search],
    );
    return result.rows;
}

export async function searchClientRowsPage(client: PoolClient, search: string | null, page: number, pageSize: number): Promise<ClientSearchPage> {
    const filters = `tenant_id = app_tenant_id()
        AND ($1::text IS NULL OR name ILIKE '%' || $1 || '%' OR cpf_cnpj ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%')`;
    const [rowsResult, summaryResult] = await Promise.all([
        client.query<ClientRow>(`SELECT ${clientFields} FROM clients WHERE ${filters} ORDER BY name, id LIMIT $2 OFFSET $3`, [search, pageSize, (page - 1) * pageSize]),
        client.query<{ total: string; new_this_month: string; with_email: string; with_address: string }>(
            `SELECT count(*) AS total,
                    count(*) FILTER (WHERE created_at >= date_trunc('month', now())) AS new_this_month,
                    count(*) FILTER (WHERE email IS NOT NULL AND email <> '') AS with_email,
                    count(*) FILTER (WHERE city IS NOT NULL AND city <> '' AND state IS NOT NULL AND state <> '') AS with_address
             FROM clients WHERE ${filters}`,
            [search],
        ),
    ]);
    const summary = summaryResult.rows[0];
    return { rows: rowsResult.rows, total: Number(summary?.total ?? 0), newThisMonth: Number(summary?.new_this_month ?? 0), withEmail: Number(summary?.with_email ?? 0), withAddress: Number(summary?.with_address ?? 0) };
}

export async function listClientRows(client: PoolClient): Promise<ClientRow[]> {
    const result = await client.query<ClientRow>(
        `SELECT ${clientFields} FROM clients WHERE tenant_id = app_tenant_id() ORDER BY name`,
    );
    return result.rows;
}

export async function findClientRow(client: PoolClient, id: string): Promise<ClientRow | null> {
    const result = await client.query<ClientRow>(
        `SELECT ${clientFields} FROM clients WHERE tenant_id = app_tenant_id() AND id = $1`, [id],
    );
    return result.rows[0] ?? null;
}

export async function findClientRowByDocumentDigits(client: PoolClient, documentDigits: string): Promise<ClientRow | null> {
    const result = await client.query<ClientRow>(
        `SELECT ${clientFields} FROM clients
         WHERE tenant_id = app_tenant_id()
           AND regexp_replace(coalesce(cpf_cnpj, ''), '\\D', '', 'g') = $1`, [documentDigits],
    );
    return result.rows[0] ?? null;
}

export async function insertClientRow(client: PoolClient, value: ClientWriteRow): Promise<ClientRow> {
    const result = await client.query<ClientRow>(
        `INSERT INTO clients (tenant_id, name, cpf_cnpj, email, cep, street, number, complement, neighborhood, city, state, company_responsible, store_name, last_seller_id)
         VALUES (app_tenant_id(), $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING ${clientFields}`,
        [value.name, value.cpfCnpj ?? null, value.email ?? null, value.cep ?? null,
         value.street ?? null, value.number ?? null, value.complement ?? null,
         value.neighborhood ?? null, value.city ?? null, value.state ?? null,
         value.companyResponsible ?? null, value.storeName ?? null, value.lastSellerId ?? null],
    );
    return result.rows[0];
}

export async function updateClientRow(client: PoolClient, id: string, value: Partial<ClientWriteRow>): Promise<ClientRow | null> {
    const result = await client.query<ClientRow>(
        `UPDATE clients SET name = COALESCE($2, name), cpf_cnpj = $3, email = $4, cep = $5, street = $6, number = $7, complement = $8,
           neighborhood = $9, city = $10, state = $11, company_responsible = $12, store_name = $13,
           last_seller_id = COALESCE($14, last_seller_id), updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1 RETURNING ${clientFields}`,
        [id, value.name ?? null, value.cpfCnpj ?? null, value.email ?? null,
         value.cep ?? null, value.street ?? null, value.number ?? null,
         value.complement ?? null, value.neighborhood ?? null, value.city ?? null,
         value.state ?? null, value.companyResponsible ?? null, value.storeName ?? null,
         value.lastSellerId ?? null],
    );
    return result.rows[0] ?? null;
}

export async function deleteClientRow(client: PoolClient, id: string): Promise<ClientRow | null> {
    const result = await client.query<ClientRow>(
        `DELETE FROM clients WHERE tenant_id = app_tenant_id() AND id = $1 RETURNING ${clientFields}`,
        [id],
    );
    return result.rows[0] ?? null;
}

export async function deleteClientCartRows(client: PoolClient, clientId: string): Promise<void> {
    await client.query("DELETE FROM client_cart_items WHERE tenant_id = app_tenant_id() AND client_id = $1", [clientId]);
}

export async function insertClientCartRow(client: PoolClient, clientId: string, item: CartItem): Promise<void> {
    await client.query(
        `INSERT INTO client_cart_items (tenant_id, client_id, cart_key, product_id, snapshot)
         VALUES (app_tenant_id(), $1, $2, $3, $4)`,
        [clientId, item.key, item.id || null, JSON.stringify(item)],
    );
}
