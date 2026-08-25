import type { PoolClient } from "pg";
import type { UserRole } from "@/lib/types";

export type TenantStatus = "active" | "inactive" | "archived";
export type PlatformPlanCode = "trial" | "essential" | "professional" | "enterprise";
export type TenantContractStatus = "draft" | "trialing" | "active" | "past_due" | "suspended" | "cancelled" | "expired";
export type TenantContractBillingCycle = "monthly" | "annual" | "custom";

export interface PlatformUserRow { id: string; email: string; name: string; password_hash: string; active: boolean }
export interface PlatformTenantRow { id: string; slug: string; name: string; status: TenantStatus; active: boolean; created_at: Date }
export interface PlatformTenantUserRow { id: string; name: string; email: string; role: UserRole; created_at: Date }
export interface TenantUserCountRow { tenant_id: string; user_count: string }
export interface TenantContractRow {
    tenant_id: string; id: string; code: PlatformPlanCode; name: string;
    status: TenantContractStatus; billing_cycle: TenantContractBillingCycle;
    currency: string; price_cents: number | null; starts_at: Date | null;
    ends_at: Date | null; external_reference: string | null;
}

export async function findPlatformUserRowByEmail(client: PoolClient, email: string): Promise<PlatformUserRow | null> {
    const result = await client.query<PlatformUserRow>(
        `SELECT id, email, name, password_hash, active FROM platform_users
         WHERE email = $1 AND active = true`, [email],
    );
    return result.rows[0] ?? null;
}

export async function findPlatformUserRowBySession(client: PoolClient, tokenHash: string): Promise<PlatformUserRow | null> {
    const result = await client.query<PlatformUserRow>(
        `SELECT u.id, u.email, u.name, u.password_hash, u.active
         FROM platform_sessions s JOIN platform_users u ON u.id = s.user_id
         WHERE s.token_hash = $1 AND s.revoked_at IS NULL
           AND s.expires_at > now() AND u.active = true`, [tokenHash],
    );
    return result.rows[0] ?? null;
}

export async function insertPlatformSessionRow(client: PoolClient, userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await client.query(
        "INSERT INTO platform_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
        [userId, tokenHash, expiresAt],
    );
}

export async function revokePlatformSessionRow(client: PoolClient, tokenHash: string): Promise<void> {
    await client.query(
        "UPDATE platform_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL",
        [tokenHash],
    );
}

export async function listPlatformTenantRows(client: PoolClient): Promise<PlatformTenantRow[]> {
    const result = await client.query<PlatformTenantRow>(
        "SELECT id, slug, name, status, active, created_at FROM tenants ORDER BY created_at DESC",
    );
    return result.rows;
}

export async function listTenantUserCountRows(client: PoolClient, tenantIds: string[]): Promise<TenantUserCountRow[]> {
    const result = await client.query<TenantUserCountRow>(
        `SELECT tenant_id, count(*)::text AS user_count FROM users
         WHERE tenant_id = ANY($1::uuid[]) AND deleted_at IS NULL GROUP BY tenant_id`,
        [tenantIds],
    );
    return result.rows;
}

export async function listLatestTenantContractRows(client: PoolClient, tenantIds: string[]): Promise<TenantContractRow[]> {
    const result = await client.query<TenantContractRow>(
        `SELECT DISTINCT ON (c.tenant_id) c.tenant_id, c.id, p.code, p.name, c.status,
           c.billing_cycle, c.currency, c.price_cents, c.starts_at, c.ends_at, c.external_reference
         FROM tenant_contracts c JOIN platform_plans p ON p.id = c.plan_id
         WHERE c.tenant_id = ANY($1::uuid[]) ORDER BY c.tenant_id, c.created_at DESC`,
        [tenantIds],
    );
    return result.rows;
}

export async function tenantExists(client: PoolClient, tenantId: string): Promise<boolean> {
    const result = await client.query("SELECT 1 FROM tenants WHERE id = $1", [tenantId]);
    return result.rowCount !== 0;
}

// Resolve o {id, slug, name} que withTenantTransaction exige, a partir de
// uma ação disparada pelo Control (sem sessão de tenant real).
export async function findTenantRow(client: PoolClient, tenantId: string): Promise<{ id: string; slug: string; name: string } | null> {
    const result = await client.query<{ id: string; slug: string; name: string }>(
        "SELECT id, slug, name FROM tenants WHERE id = $1", [tenantId],
    );
    return result.rows[0] ?? null;
}

export async function listPlatformTenantUserRows(client: PoolClient, tenantId: string): Promise<PlatformTenantUserRow[]> {
    const result = await client.query<PlatformTenantUserRow>(
        `SELECT id, name, email, role, created_at FROM users
         WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
        [tenantId],
    );
    return result.rows;
}

export async function insertTenantRow(client: PoolClient, slug: string, name: string): Promise<{ id: string; slug: string; name: string }> {
    const result = await client.query<{ id: string; slug: string; name: string }>(
        `INSERT INTO tenants (slug, name, active, status) VALUES ($1, $2, true, 'active') RETURNING id, slug, name`,
        [slug, name],
    );
    return result.rows[0];
}

export async function updateTenantStatusRow(client: PoolClient, id: string, status: TenantStatus, active: boolean): Promise<PlatformTenantRow | null> {
    const result = await client.query<PlatformTenantRow>(
        `UPDATE tenants SET status = $2, active = $3, updated_at = now()
         WHERE id = $1 RETURNING id, slug, name, status, active, created_at`,
        [id, status, active],
    );
    return result.rows[0] ?? null;
}

export async function insertTenantAdministratorRow(client: PoolClient, tenantId: string, email: string, name: string, passwordHash: string): Promise<PlatformTenantUserRow> {
    const result = await client.query<PlatformTenantUserRow>(
        `INSERT INTO users (tenant_id, email, name, role, password_hash, permissions)
         VALUES ($1, $2, $3, 'administrador', $4, '{"adminAccess": true, "catalogAreas": []}'::jsonb)
         RETURNING id, name, email, role, created_at`,
        [tenantId, email, name, passwordHash],
    );
    return result.rows[0];
}

export async function softDeleteTenantUserRow(client: PoolClient, tenantId: string, userId: string): Promise<{ id: string } | null> {
    const result = await client.query<{ id: string }>(
        `UPDATE users SET deleted_at = now(), updated_at = now()
         WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
         RETURNING id`,
        [tenantId, userId],
    );
    return result.rows[0] ?? null;
}

export async function insertTenantStoreSettingsRow(client: PoolClient, tenantId: string): Promise<void> {
    await client.query("INSERT INTO store_settings (tenant_id) VALUES ($1)", [tenantId]);
}

export async function insertDefaultInventoryLocationRow(client: PoolClient, tenantId: string): Promise<string> {
    const result = await client.query<{ id: string }>(
        `INSERT INTO inventory_locations (tenant_id, code, name, kind, is_default)
         VALUES ($1, 'default', 'Depósito padrão', 'warehouse', true) RETURNING id`,
        [tenantId],
    );
    return result.rows[0].id;
}

export async function setDefaultInventoryLocationRow(client: PoolClient, tenantId: string, locationId: string): Promise<void> {
    await client.query(
        "UPDATE store_settings SET default_inventory_location_id = $2 WHERE tenant_id = $1",
        [tenantId, locationId],
    );
}
