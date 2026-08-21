import { hash } from "@node-rs/argon2";
import {
    CreateTenantUserInputSchema,
    DEFAULT_SELLER_CATALOG_AREAS,
    UpdateOwnProfileInputSchema,
    UpdateTenantUserInputSchema,
} from "@/contracts/auth";
import type { PoolClient } from "pg";
import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, UserRole } from "@/lib/types";
import { deleteClientRow, listClientRows } from "@/models/clientsModel";
import {
    findUserRowByEmail, findUserRowById, insertUserRow, listUserRows, listUserRowsByIds,
    revokeUserSessionRows, softDeleteUserRow, updateUserRow,
} from "@/models/usersModel";
import { recordAuditEvent, USER_AUDIT_ACTIONS, type AuditRequestContext } from "@/services/audit";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/services/shared/errors";
import { toClient } from "@/services/clients/clientMapper";
import { notifySignup } from "@/services/notifications";
import { toAuthUser } from "./userMapper";

export { toAuthUser } from "./userMapper";

const PASSWORD_OPTIONS = { memoryCost: 19 * 1024, timeCost: 2, parallelism: 1 };

// Leitura reutilizÃ¡vel para recursos que guardam apenas user_id e precisam
// exibir a identidade/papel atual da conta sem duplicar esses campos.
export async function listUsersByIds(client: PoolClient, ids: string[]): Promise<AuthUser[]> {
    const uniqueIds = [...new Set(ids)];
    return Promise.all((await listUserRowsByIds(client, uniqueIds)).map(toAuthUser));
}

export function isAdministrator(user: AuthUser | null): boolean {
    return user?.role === "administrador" && user.permissions?.adminAccess === true;
}

export function defaultPermissionsFor(role: UserRole): NonNullable<AuthUser["permissions"]> {
    switch (role) {
        case "administrador": return { adminAccess: true, catalogAreas: [] };
        case "vendedora": return { adminAccess: false, catalogAreas: [...DEFAULT_SELLER_CATALOG_AREAS] };
        default: return { adminAccess: false, catalogAreas: [] };
    }
}

export async function createUserRecord(
    client: PoolClient,
    actor: Pick<AuthUser, "id" | "role" | "name"> | null,
    context: AuditRequestContext,
    params: { email: string; name: string; password: string; role: UserRole; clientId?: string; permissions?: AuthUser["permissions"] },
): Promise<AuthUser> {
    return createUserRecordWithPasswordHash(client, actor, context, {
        ...params,
        passwordHash: await hash(params.password, PASSWORD_OPTIONS),
    });
}

/** Cria a conta usando uma senha já derivada, usada no e-mail de primeiro acesso. */
export async function createUserRecordWithPasswordHash(
    client: PoolClient,
    actor: Pick<AuthUser, "id" | "role" | "name"> | null,
    context: AuditRequestContext,
    params: {
        email: string; name: string; role: UserRole; clientId?: string;
        permissions?: AuthUser["permissions"]; passwordHash: string;
    },
): Promise<AuthUser> {
    const email = params.email.trim().toLowerCase();
    if (await findUserRowByEmail(client, email)) throw new ConflictError("EMAIL_TAKEN");
    const created = await toAuthUser(await insertUserRow(client, {
        email,
        name: params.name.trim(),
        role: params.role,
        passwordHash: params.passwordHash,
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
        return Promise.all(userRows.map(async (row) => {
            const user = await toAuthUser(row);
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
        }));
    });
}

export async function createTenantUser(
    tenant: Tenant,
    actor: AuthUser,
    body: unknown,
    context: AuditRequestContext,
): Promise<AuthUser> {
    if (!isAdministrator(actor)) throw new ForbiddenError();
    const parsed = CreateTenantUserInputSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("INVALID_INPUT", "Dados inválidos.", parsed.error.issues);
    const { email, name, password, catalogAreas } = parsed.data;
    const role: UserRole = parsed.data.role ?? "vendedora";
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
    body: unknown,
): Promise<AuthUser> {
    if (!isAdministrator(actor)) throw new ForbiddenError();
    const parsed = UpdateTenantUserInputSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("INVALID_INPUT", "Dados inválidos.", parsed.error.issues);
    const { email, name, catalogAreas, password } = parsed.data;
    return withTenantTransaction(tenant, actor, async (client) => {
        const current = await findUserRowById(client, id);
        if (!current) throw new NotFoundError("USER_NOT_FOUND");
        if (email) {
            const existing = await findUserRowByEmail(client, email);
            if (existing && existing.id !== id) throw new ConflictError("EMAIL_TAKEN");
        }
        const updated = await updateUserRow(client, id, {
            name,
            email,
            passwordHash: password ? await hash(password, PASSWORD_OPTIONS) : undefined,
            permissions: catalogAreas ? { ...current.permissions, catalogAreas } : undefined,
        });
        if (!updated) throw new NotFoundError("USER_NOT_FOUND");
        return toAuthUser(updated);
    });
}

/** Atualiza apenas os dados de perfil da pr\u00f3pria conta autenticada. */
export async function updateOwnProfile(
    tenant: Tenant,
    actor: AuthUser,
    body: unknown,
    context: AuditRequestContext,
): Promise<AuthUser> {
    const parsed = UpdateOwnProfileInputSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("INVALID_INPUT", "Dados inv\u00e1lidos.", parsed.error.issues);

    return withTenantTransaction(tenant, actor, async (client) => {
        const updated = await updateUserRow(client, actor.id, parsed.data);
        if (!updated) throw new NotFoundError("USER_NOT_FOUND");
        const user = await toAuthUser(updated);
        await recordAuditEvent(client, {
            action: USER_AUDIT_ACTIONS.UPDATED,
            entityId: user.id,
            actor,
            context,
            metadata: { fields: Object.keys(parsed.data) },
        });
        return user;
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
