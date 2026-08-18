import { hash } from "@node-rs/argon2";
import type { PoolClient } from "pg";
import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, UserRole } from "@/lib/types";
import { findUserRowByEmail, insertUserRow, listUserRows, type UserRow } from "@/models/usersModel";
import { recordAuditEvent, USER_AUDIT_ACTIONS, type AuditRequestContext } from "@/services/audit";
import { ForbiddenError } from "@/services/shared/errors";

const PASSWORD_OPTIONS = { memoryCost: 19 * 1024, timeCost: 2, parallelism: 1 };

function toAuthUser(row: UserRow): AuthUser {
    return {
        id: row.id, email: row.email, name: row.name, role: row.role,
        clientId: row.client_id ?? undefined, permissions: row.permissions,
    };
}

export function isAdministrator(user: AuthUser | null): boolean {
    return user?.role === "administrador" && user.permissions?.adminAccess === true;
}

export function defaultPermissionsFor(role: UserRole): NonNullable<AuthUser["permissions"]> {
    switch (role) {
        case "administrador": return { adminAccess: true, catalogAreas: [] };
        case "vendedora": return { adminAccess: false, catalogAreas: ["talao", "pedidos"] };
        default: return { adminAccess: false, catalogAreas: [] };
    }
}

async function createUser(
    client: PoolClient,
    actor: Pick<AuthUser, "id" | "role" | "name">,
    context: AuditRequestContext,
    params: { email: string; name: string; password: string; role: UserRole; clientId?: string; permissions?: AuthUser["permissions"] },
): Promise<AuthUser> {
    const email = params.email.trim().toLowerCase();
    if (await findUserRowByEmail(client, email)) throw new Error("EMAIL_TAKEN");
    const created = toAuthUser(await insertUserRow(client, {
        email,
        name: params.name.trim(),
        role: params.role,
        passwordHash: await hash(params.password, PASSWORD_OPTIONS),
        clientId: params.clientId,
        permissions: params.permissions ?? defaultPermissionsFor(params.role),
    }));
    await recordAuditEvent(client, {
        action: USER_AUDIT_ACTIONS.CREATED,
        entityId: created.id,
        actor,
        context,
        metadata: { createdRole: created.role },
    });
    return created;
}

export async function users(tenant: Tenant, actor: AuthUser): Promise<AuthUser[]> {
    if (!isAdministrator(actor)) throw new ForbiddenError();
    return withTenantTransaction(tenant, actor, async (client) =>
        (await listUserRows(client)).map(toAuthUser),
    );
}

export async function createTenantUser(
    tenant: Tenant,
    actor: AuthUser,
    body: { email?: unknown; name?: unknown; password?: unknown; role?: unknown; catalogAreas?: unknown },
    context: AuditRequestContext,
): Promise<AuthUser> {
    if (!isAdministrator(actor)) throw new ForbiddenError();
    const email = typeof body.email === "string" ? body.email : null;
    const name = typeof body.name === "string" ? body.name : null;
    const password = typeof body.password === "string" ? body.password : null;
    if (!email || !name || !password) throw new Error("INVALID_INPUT");
    if (password.length < 12) throw new Error("WEAK_PASSWORD");
    const roles: UserRole[] = ["administrador", "vendedora", "expedicao", "entregador", "cliente"];
    if (!roles.includes(body.role as UserRole)) throw new Error("INVALID_INPUT");
    return withTenantTransaction(tenant, actor, (client) => createUser(client, actor, context, {
        email,
        name,
        password,
        role: body.role as UserRole,
        permissions: Array.isArray(body.catalogAreas) ? {
            adminAccess: body.role === "administrador",
            catalogAreas: body.catalogAreas.filter((area): area is string => typeof area === "string"),
        } : undefined,
    }));
}
