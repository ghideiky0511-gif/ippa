import { hash } from "@node-rs/argon2";
import type { PoolClient } from "pg";
import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, UserRole } from "@/lib/types";
import { deleteClientRow, listClientRows } from "@/models/clientsModel";
import {
    findUserRowByEmail, findUserRowById, insertUserRow, listUserRows,
    revokeUserSessionRows, softDeleteUserRow, updateUserRow, type UserRow,
} from "@/models/usersModel";
import { recordAuditEvent, USER_AUDIT_ACTIONS, type AuditRequestContext } from "@/services/audit";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/services/shared/errors";
import { toClient } from "@/services/clients/clientMapper";
import { notifySignup } from "@/services/notifications";

const PASSWORD_OPTIONS = { memoryCost: 19 * 1024, timeCost: 2, parallelism: 1 };

export const KNOWN_CATALOG_AREAS = ["talao", "pedidos"] as const;

export function toAuthUser(row: UserRow): AuthUser {
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

export async function createUserRecord(
    client: PoolClient,
    actor: Pick<AuthUser, "id" | "role" | "name"> | null,
    context: AuditRequestContext,
    params: { email: string; name: string; password: string; role: UserRole; clientId?: string; permissions?: AuthUser["permissions"] },
): Promise<AuthUser> {
    const email = params.email.trim().toLowerCase();
    if (await findUserRowByEmail(client, email)) throw new ConflictError("EMAIL_TAKEN");
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
        actor: actor ?? created,
        context,
        metadata: { createdRole: created.role },
    });
    return created;
}

export async function users(tenant: Tenant, actor: AuthUser): Promise<Array<AuthUser & Record<string, unknown>>> {
    if (!isAdministrator(actor)) throw new ForbiddenError();
    return withTenantTransaction(tenant, actor, async (client) => {
        const [userRows, clientRows] = await Promise.all([listUserRows(client), listClientRows(client)]);
        const clientsById = new Map(clientRows.map((row) => [row.id, toClient(row)]));
        return userRows.map((row) => {
            const user = toAuthUser(row);
            const registration = user.clientId ? clientsById.get(user.clientId) : undefined;
            return {
                ...user,
                cpfCnpj: registration?.cpfCnpj,
                cep: registration?.cep,
                street: registration?.street,
                number: registration?.number,
                complement: registration?.complement,
                neighborhood: registration?.neighborhood,
                city: registration?.city,
                state: registration?.state,
                companyResponsible: registration?.companyResponsible,
                storeName: registration?.storeName,
                clientEmail: registration?.email,
                lastSellerId: registration?.lastSellerId,
                createdAt: registration?.createdAt,
            };
        });
    });
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
    if (!email || !name || !password) throw new ValidationError();
    if (password.length < 6) throw new ValidationError("WEAK_PASSWORD");
    const roles: UserRole[] = ["administrador", "vendedora", "expedicao", "entregador", "cliente"];
    const role: UserRole = body.role === undefined ? "vendedora" : body.role as UserRole;
    if (!roles.includes(role)) throw new ValidationError();
    const catalogAreas = Array.isArray(body.catalogAreas)
        ? body.catalogAreas.filter((area): area is string => typeof area === "string" &&
            KNOWN_CATALOG_AREAS.includes(area as typeof KNOWN_CATALOG_AREAS[number]))
        : undefined;
    const created = await withTenantTransaction(tenant, actor, (client) => createUserRecord(client, actor, context, {
        email,
        name,
        password,
        role,
        permissions: catalogAreas ? {
            adminAccess: role === "administrador",
            catalogAreas,
        } : undefined,
    }));
    notifySignup(tenant, created);
    return created;
}

export async function updateTenantUser(
    tenant: Tenant,
    actor: AuthUser,
    id: string,
    body: { name?: unknown; email?: unknown; password?: unknown; catalogAreas?: unknown },
): Promise<AuthUser> {
    if (!isAdministrator(actor)) throw new ForbiddenError();
    const password = typeof body.password === "string" && body.password ? body.password : undefined;
    if (password && password.length < 6) throw new ValidationError("WEAK_PASSWORD");
    return withTenantTransaction(tenant, actor, async (client) => {
        const current = await findUserRowById(client, id);
        if (!current) throw new NotFoundError("USER_NOT_FOUND");
        const email = typeof body.email === "string" && body.email.trim() ? body.email.trim().toLowerCase() : undefined;
        if (email) {
            const existing = await findUserRowByEmail(client, email);
            if (existing && existing.id !== id) throw new ConflictError("EMAIL_TAKEN");
        }
        const catalogAreas = Array.isArray(body.catalogAreas)
            ? body.catalogAreas.filter((area): area is string => typeof area === "string" &&
                KNOWN_CATALOG_AREAS.includes(area as typeof KNOWN_CATALOG_AREAS[number]))
            : undefined;
        const updated = await updateUserRow(client, id, {
            name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : undefined,
            email,
            passwordHash: password ? await hash(password, PASSWORD_OPTIONS) : undefined,
            permissions: catalogAreas ? { ...current.permissions, catalogAreas } : undefined,
        });
        if (!updated) throw new NotFoundError("USER_NOT_FOUND");
        return toAuthUser(updated);
    });
}

export async function deleteTenantUser(tenant: Tenant, actor: AuthUser, id: string): Promise<void> {
    if (!isAdministrator(actor)) throw new ForbiddenError();
    if (actor.id === id) throw new ConflictError("CANNOT_DELETE_SELF");
    await withTenantTransaction(tenant, actor, async (client) => {
        const removed = await softDeleteUserRow(client, id);
        if (!removed) throw new NotFoundError("USER_NOT_FOUND");
        await revokeUserSessionRows(client, id);
        if (removed.role === "cliente" && removed.client_id) await deleteClientRow(client, removed.client_id);
    });
}
