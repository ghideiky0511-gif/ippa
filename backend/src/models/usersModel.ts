import type { PoolClient } from "pg";
import type { AuthUser, UserRole } from "@/lib/types";

export interface UserRow {
    id: string; email: string; name: string; role: UserRole; client_id: string | null;
    avatar_url: string | null; permissions: AuthUser["permissions"]; password_hash: string;
}

const userFields = "id, email, name, role, avatar_url, client_id, permissions, password_hash";

export async function findUserRowByEmail(client: PoolClient, email: string): Promise<UserRow | null> {
    const result = await client.query<UserRow>(
        `SELECT ${userFields} FROM users
         WHERE tenant_id = app_tenant_id() AND email = $1 AND deleted_at IS NULL`, [email],
    );
    return result.rows[0] ?? null;
}

export async function findUserRowById(client: PoolClient, id: string): Promise<UserRow | null> {
    const result = await client.query<UserRow>(
        `SELECT ${userFields} FROM users
         WHERE tenant_id = app_tenant_id() AND id = $1 AND deleted_at IS NULL`, [id],
    );
    return result.rows[0] ?? null;
}

export async function findUserRowByClientId(client: PoolClient, clientId: string): Promise<UserRow | null> {
    const result = await client.query<UserRow>(
        `SELECT ${userFields} FROM users
         WHERE tenant_id = app_tenant_id() AND client_id = $1 AND deleted_at IS NULL`, [clientId],
    );
    return result.rows[0] ?? null;
}

export async function insertUserRow(client: PoolClient, params: {
    email: string; name: string; role: UserRole; passwordHash: string;
    clientId?: string; avatarUrl?: string; permissions: AuthUser["permissions"];
}): Promise<UserRow> {
    const result = await client.query<UserRow>(
        `INSERT INTO users (tenant_id, email, name, role, password_hash, avatar_url, client_id, permissions)
         VALUES (app_tenant_id(), $1, $2, $3, $4, $5, $6, $7)
         RETURNING ${userFields}`,
        [params.email, params.name, params.role, params.passwordHash,
         params.avatarUrl ?? null, params.clientId ?? null, JSON.stringify(params.permissions ?? {})],
    );
    return result.rows[0];
}

export async function listUserRows(client: PoolClient): Promise<UserRow[]> {
    const result = await client.query<UserRow>(
        `SELECT ${userFields} FROM users
         WHERE tenant_id = app_tenant_id() AND deleted_at IS NULL ORDER BY name, email`,
    );
    return result.rows;
}

/** Localiza somente a conta da cliente vinculada ao CPF/CNPJ informado. */
export async function findCustomerUserRowByDocumentDigits(client: PoolClient, documentDigits: string): Promise<UserRow | null> {
    const result = await client.query<UserRow>(
        `SELECT users.id, users.email, users.name, users.role, users.avatar_url, users.client_id, users.permissions, users.password_hash
         FROM users
         JOIN clients ON clients.id = users.client_id AND clients.tenant_id = app_tenant_id()
         WHERE users.tenant_id = app_tenant_id() AND users.deleted_at IS NULL AND users.role = 'cliente'
           AND regexp_replace(coalesce(clients.cpf_cnpj, ''), '\\D', '', 'g') = $1`,
        [documentDigits],
    );
    return result.rows[0] ?? null;
}

export async function listUserRowsByIds(client: PoolClient, ids: string[]): Promise<UserRow[]> {
    if (ids.length === 0) return [];
    const result = await client.query<UserRow>(
        `SELECT ${userFields} FROM users
         WHERE tenant_id = app_tenant_id() AND id = ANY($1::uuid[]) AND deleted_at IS NULL`,
        [ids],
    );
    return result.rows;
}


export async function updateUserRow(client: PoolClient, id: string, value: {
    name?: string; email?: string; passwordHash?: string; avatarUrl?: string | null; permissions?: AuthUser["permissions"];
}): Promise<UserRow | null> {
    const result = await client.query<UserRow>(
        `UPDATE users SET name = COALESCE($2, name), email = COALESCE($3, email),
           password_hash = COALESCE($4, password_hash), permissions = COALESCE($5, permissions),
           avatar_url = CASE WHEN $6 THEN $7 ELSE avatar_url END, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1 AND deleted_at IS NULL
         RETURNING ${userFields}`,
        [id, value.name ?? null, value.email ?? null, value.passwordHash ?? null,
         value.permissions ? JSON.stringify(value.permissions) : null,
         value.avatarUrl !== undefined, value.avatarUrl ?? null],
    );
    return result.rows[0] ?? null;
}

export async function softDeleteUserRow(client: PoolClient, id: string): Promise<UserRow | null> {
    const result = await client.query<UserRow>(
        `UPDATE users SET deleted_at = now(), updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1 AND deleted_at IS NULL
         RETURNING ${userFields}`,
        [id],
    );
    return result.rows[0] ?? null;
}

export async function listAdministradorUserIds(client: PoolClient): Promise<string[]> {
    const result = await client.query<{ id: string }>(
        `SELECT id FROM users
         WHERE tenant_id = app_tenant_id() AND role = 'administrador' AND deleted_at IS NULL`,
    );
    return result.rows.map((row) => row.id);
}

export async function listOnlineSellerIds(client: PoolClient): Promise<string[]> {
    const result = await client.query<{ id: string }>(
        `SELECT DISTINCT users.id FROM users
         JOIN user_sessions ON user_sessions.user_id = users.id
         WHERE users.tenant_id = app_tenant_id() AND users.role = 'vendedora'
           AND users.deleted_at IS NULL AND user_sessions.revoked_at IS NULL
           AND user_sessions.expires_at > now()
         ORDER BY users.id`,
    );
    return result.rows.map((row) => row.id);
}

/** Administradoras ativas formam a fila de cobertura quando não há vendedora. */
export async function listOnlineAdministratorIds(client: PoolClient): Promise<string[]> {
    const result = await client.query<{ id: string }>(
        `SELECT DISTINCT users.id FROM users
         JOIN user_sessions ON user_sessions.user_id = users.id
         WHERE users.tenant_id = app_tenant_id() AND users.role = 'administrador'
           AND users.deleted_at IS NULL AND user_sessions.revoked_at IS NULL
           AND user_sessions.expires_at > now()
         ORDER BY users.id`,
    );
    return result.rows.map((row) => row.id);
}

export async function revokeUserSessionRows(client: PoolClient, userId: string): Promise<void> {
    await client.query(
        `UPDATE user_sessions SET revoked_at = now()
         WHERE tenant_id = app_tenant_id() AND user_id = $1 AND revoked_at IS NULL`,
        [userId],
    );
}
