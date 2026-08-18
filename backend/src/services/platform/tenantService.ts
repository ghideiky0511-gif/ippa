import { hash } from "@node-rs/argon2";
import { withControlTransaction } from "@/lib/db/control";
import {
    insertDefaultInventoryLocationRow,
    insertTenantAdministratorRow,
    insertTenantRow,
    insertTenantStoreSettingsRow,
    listLatestTenantContractRows,
    listPlatformTenantRows,
    listPlatformTenantUserRows,
    listTenantUserCountRows,
    setDefaultInventoryLocationRow,
    tenantExists,
    updateTenantStatusRow,
    type TenantStatus,
} from "@/models/platformModel";
import type { PlatformTenant, PlatformTenantContract, PlatformTenantUser } from "./types";

const PASSWORD_OPTIONS = { memoryCost: 19 * 1024, timeCost: 2, parallelism: 1 };
const RESERVED_SLUGS = new Set(["admin", "api", "control", "favicon.ico"]);

export async function listTenants(): Promise<PlatformTenant[]> {
    return withControlTransaction(async (client) => {
        const rows = await listPlatformTenantRows(client);
        if (rows.length === 0) return [];
        const tenantIds = rows.map((row) => row.id);
        const [counts, contracts] = await Promise.all([
            listTenantUserCountRows(client, tenantIds),
            listLatestTenantContractRows(client, tenantIds),
        ]);
        const countByTenant = new Map(counts.map((row) => [row.tenant_id, Number(row.user_count)]));
        const contractByTenant = new Map<string, PlatformTenantContract>(contracts.map((row) => [row.tenant_id, {
            id: row.id,
            plan: { code: row.code, name: row.name },
            status: row.status,
            billingCycle: row.billing_cycle,
            currency: row.currency,
            priceCents: row.price_cents,
            startsAt: row.starts_at?.toISOString() ?? null,
            endsAt: row.ends_at?.toISOString() ?? null,
            externalReference: row.external_reference,
        }]));
        return rows.map((row) => ({
            id: row.id,
            slug: row.slug,
            name: row.name,
            status: row.status,
            active: row.active,
            createdAt: row.created_at.toISOString(),
            userCount: countByTenant.get(row.id) ?? 0,
            contract: contractByTenant.get(row.id) ?? null,
        }));
    });
}

export async function listTenantUsers(id: string): Promise<PlatformTenantUser[] | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("INVALID_TENANT_ID");
    return withControlTransaction(async (client) => {
        if (!await tenantExists(client, id)) return null;
        const rows = await listPlatformTenantUserRows(client, id);
        return rows.map((row) => ({
            id: row.id,
            name: row.name,
            email: row.email,
            role: row.role,
            active: true,
            createdAt: row.created_at.toISOString(),
        }));
    });
}

export async function provisionTenant(input: {
    slug: string; name: string; adminName: string; adminEmail: string; adminPassword: string;
}): Promise<PlatformTenant> {
    const slug = input.slug.trim().toLowerCase();
    const name = input.name.trim();
    const adminName = input.adminName.trim();
    const adminEmail = input.adminEmail.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug) || RESERVED_SLUGS.has(slug)) {
        throw new Error("INVALID_SLUG");
    }
    if (!name || !adminName || !/^\S+@\S+\.\S+$/.test(adminEmail) || input.adminPassword.length < 12) {
        throw new Error("INVALID_TENANT_INPUT");
    }

    return withControlTransaction(async (client) => {
        const tenant = await insertTenantRow(client, slug, name);
        await insertTenantStoreSettingsRow(client, tenant.id);
        const locationId = await insertDefaultInventoryLocationRow(client, tenant.id);
        await setDefaultInventoryLocationRow(client, tenant.id, locationId);
        await insertTenantAdministratorRow(
            client, tenant.id, adminEmail, adminName, await hash(input.adminPassword, PASSWORD_OPTIONS),
        );
        return {
            ...tenant,
            status: "active",
            active: true,
            createdAt: new Date().toISOString(),
            userCount: 1,
            contract: null,
        };
    });
}

export async function changeTenantStatus(id: string, status: string): Promise<PlatformTenant | null> {
    const statuses: TenantStatus[] = ["active", "inactive", "archived"];
    if (!/^[0-9a-f-]{36}$/i.test(id) || !statuses.includes(status as TenantStatus)) {
        throw new Error("INVALID_TENANT_STATUS");
    }
    return withControlTransaction(async (client) => {
        const row = await updateTenantStatusRow(client, id, status as TenantStatus, status === "active");
        return row ? {
            id: row.id,
            slug: row.slug,
            name: row.name,
            status: row.status,
            active: row.active,
            createdAt: row.created_at.toISOString(),
            userCount: 0,
            contract: null,
        } : null;
    });
}
