import type { PoolClient } from "pg";
import type { AuthUser, UserRole } from "@/lib/types";

export interface UserRow {
    id: string; email: string; name: string; role: UserRole; client_id: string | null;
    permissions: AuthUser["permissions"]; password_hash: string;
}

const userFields = "id, email, name, role, client_id, permissions, password_hash";

export async function findUserRowByEmail(client: PoolClient, email: string): Promise<UserRow | null> {
    const result = await client.query<UserRow>(
        `SELECT ${userFields} FROM users WHERE tenant_id = app_tenant_id() AND email = $1`, [email],
    );
    return result.rows[0] ?? null;
}

export async function findUserRowById(client: PoolClient, id: string): Promise<UserRow | null> {
    const result = await client.query<UserRow>(
        `SELECT ${userFields} FROM users WHERE tenant_id = app_tenant_id() AND id = $1`, [id],
    );
    return result.rows[0] ?? null;
}

export async function insertUserRow(client: PoolClient, params: {
    email: string; name: string; role: UserRole; passwordHash: string;
    clientId?: string; permissions: AuthUser["permissions"];
}): Promise<UserRow> {
    const result = await client.query<UserRow>(
        `INSERT INTO users (tenant_id, email, name, role, password_hash, client_id, permissions)
         VALUES (app_tenant_id(), $1, $2, $3, $4, $5, $6)
         RETURNING ${userFields}`,
        [params.email, params.name, params.role, params.passwordHash,
         params.clientId ?? null, JSON.stringify(params.permissions ?? {})],
    );
    return result.rows[0];
}

export async function listUserRows(client: PoolClient): Promise<UserRow[]> {
    const result = await client.query<UserRow>(
        `SELECT ${userFields} FROM users WHERE tenant_id = app_tenant_id() ORDER BY name, email`,
    );
    return result.rows;
}
