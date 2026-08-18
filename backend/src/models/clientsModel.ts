import type { PoolClient } from 'pg';
import type { CartItem, Client } from '@/lib/types';

type ClientRow = {
  id: string; name: string; cpf_cnpj: string | null; email: string | null; cep: string | null; street: string | null; number: string | null; complement: string | null; neighborhood: string | null; city: string | null; state: string | null; company_responsible: string | null; store_name: string | null; last_seller_id: string | null; created_at: Date; updated_at: Date;
};

function mapClient(row: ClientRow): Client {
  return { id: row.id, name: row.name, cpfCnpj: row.cpf_cnpj ?? undefined, email: row.email ?? undefined, cep: row.cep ?? undefined,
    street: row.street ?? undefined, number: row.number ?? undefined, complement: row.complement ?? undefined, neighborhood: row.neighborhood ?? undefined,
    city: row.city ?? undefined, state: row.state ?? undefined, companyResponsible: row.company_responsible ?? undefined, storeName: row.store_name ?? undefined,
    lastSellerId: row.last_seller_id ?? undefined, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() };
}

const clientFields = 'id, name, cpf_cnpj, email, cep, street, number, complement, neighborhood, city, state, company_responsible, store_name, last_seller_id, created_at, updated_at';

export async function searchClients(client: PoolClient, search?: string): Promise<Client[]> {
  const result = await client.query<ClientRow>(
    `SELECT ${clientFields} FROM clients
     WHERE tenant_id = app_tenant_id() AND ($1::text IS NULL OR name ILIKE '%' || $1 || '%' OR cpf_cnpj ILIKE '%' || $1 || '%')
     ORDER BY name LIMIT 20`, [search?.trim() || null],
  );
  return result.rows.map(mapClient);
}

export async function findClient(client: PoolClient, id: string): Promise<Client | null> {
  const result = await client.query<ClientRow>(`SELECT ${clientFields} FROM clients WHERE tenant_id = app_tenant_id() AND id = $1`, [id]);
  return result.rows[0] ? mapClient(result.rows[0]) : null;
}

export async function findClientByDocument(client: PoolClient, cpfCnpj: string): Promise<Client | null> {
  const digits = cpfCnpj.replace(/\D/g, '');
  if (!digits) return null;
  const result = await client.query<ClientRow>(
    `SELECT ${clientFields} FROM clients WHERE tenant_id = app_tenant_id() AND regexp_replace(coalesce(cpf_cnpj, ''), '\\D', '', 'g') = $1`, [digits],
  );
  return result.rows[0] ? mapClient(result.rows[0]) : null;
}

export async function insertClient(client: PoolClient, value: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>): Promise<Client> {
  const result = await client.query<ClientRow>(
    `INSERT INTO clients (tenant_id, name, cpf_cnpj, email, cep, street, number, complement, neighborhood, city, state, company_responsible, store_name, last_seller_id)
     VALUES (app_tenant_id(), $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING ${clientFields}`,
    [value.name, value.cpfCnpj ?? null, value.email ?? null, value.cep ?? null, value.street ?? null, value.number ?? null, value.complement ?? null, value.neighborhood ?? null, value.city ?? null, value.state ?? null, value.companyResponsible ?? null, value.storeName ?? null, value.lastSellerId ?? null],
  );
  return mapClient(result.rows[0]);
}

export async function replaceClient(client: PoolClient, id: string, value: Partial<Client>): Promise<Client | null> {
  const result = await client.query<ClientRow>(
    `UPDATE clients SET name = COALESCE($2, name), cpf_cnpj = $3, email = $4, cep = $5, street = $6, number = $7, complement = $8,
       neighborhood = $9, city = $10, state = $11, company_responsible = $12, store_name = $13, updated_at = now()
     WHERE tenant_id = app_tenant_id() AND id = $1 RETURNING ${clientFields}`,
    [id, value.name?.trim() || null, value.cpfCnpj ?? null, value.email ?? null, value.cep ?? null, value.street ?? null, value.number ?? null, value.complement ?? null, value.neighborhood ?? null, value.city ?? null, value.state ?? null, value.companyResponsible ?? null, value.storeName ?? null],
  );
  return result.rows[0] ? mapClient(result.rows[0]) : null;
}

export async function replaceClientCart(client: PoolClient, clientId: string, items: CartItem[]): Promise<void> {
  await client.query('DELETE FROM client_cart_items WHERE tenant_id = app_tenant_id() AND client_id = $1', [clientId]);
  for (const item of items) {
    await client.query(
      `INSERT INTO client_cart_items (tenant_id, client_id, cart_key, product_id, snapshot)
       VALUES (app_tenant_id(), $1, $2, $3, $4)`, [clientId, item.key, item.id || null, JSON.stringify(item)],
    );
  }
}
