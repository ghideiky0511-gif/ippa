import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, Client } from "@/lib/types";
import {
    findClientRow,
    findClientRowByDocumentDigits,
    insertClientRow,
    searchClientRows,
    updateClientRow,
} from "@/models/clientsModel";
import { findUserRowByClientId } from "@/models/usersModel";
import { recordAuditEvent, CLIENT_AUDIT_ACTIONS, type AuditRequestContext } from "@/services/audit";
import { ConflictError, ForbiddenError, ValidationError } from "@/services/shared/errors";
import { toClient } from "./clientMapper";

const AUDITED_CLIENT_FIELDS = [
    "name", "cpfCnpj", "email", "cep", "street", "number", "complement",
    "neighborhood", "city", "state", "companyResponsible", "storeName",
] as const;

function canManageClients(user: AuthUser): boolean {
    return user.role === "administrador" || user.role === "vendedora";
}

function documentDigits(value: string): string {
    return value.replace(/\D/g, "");
}

export async function searchTenantClients(tenant: Tenant, user: AuthUser, query?: string): Promise<Client[]> {
    if (!canManageClients(user)) throw new ForbiddenError();
    return withTenantTransaction(tenant, user, async (client) =>
        (await searchClientRows(client, query?.trim() || null)).map(toClient),
    );
}

export async function getTenantClient(tenant: Tenant, user: AuthUser, id: string): Promise<(Client & { hasLogin: boolean }) | null> {
    if (!canManageClients(user) && user.clientId !== id) throw new ForbiddenError();
    return withTenantTransaction(tenant, user, async (client) => {
        const row = await findClientRow(client, id);
        if (!row) return null;
        return { ...toClient(row), hasLogin: Boolean(await findUserRowByClientId(client, id)) };
    });
}

export async function createTenantClient(
    tenant: Tenant,
    user: AuthUser,
    value: Pick<Client, "name" | "cpfCnpj">,
    context: AuditRequestContext,
): Promise<Client> {
    if (!canManageClients(user)) throw new ForbiddenError();
    if (typeof value.name !== "string" || !value.name.trim()) throw new ValidationError();
    return withTenantTransaction(tenant, user, async (client) => {
        const currentRow = await findClientRow(client, id);
        if (!currentRow) return null;
        const current = toClient(currentRow);
        const merged = { ...current, ...value };
        const digits = merged.cpfCnpj ? documentDigits(merged.cpfCnpj) : "";
        if (digits && await findClientRowByDocumentDigits(client, digits)) {
            throw new ConflictError("DOCUMENT_TAKEN");
        }
        const created = toClient(await insertClientRow(client, {
            name: value.name.trim(),
            cpfCnpj: value.cpfCnpj,
            lastSellerId: user.id,
        }));
        await recordAuditEvent(client, {
            action: CLIENT_AUDIT_ACTIONS.CREATED,
            entityId: created.id,
            actor: user,
            context,
        });
        return created;
    });
}

export async function updateTenantClient(
    tenant: Tenant,
    user: AuthUser,
    id: string,
    value: Partial<Client>,
    context: AuditRequestContext,
): Promise<Client | null> {
    if (!canManageClients(user) && user.clientId !== id) throw new ForbiddenError();
    return withTenantTransaction(tenant, user, async (client) => {
        const digits = value.cpfCnpj ? documentDigits(value.cpfCnpj) : "";
        if (digits) {
            const existing = await findClientRowByDocumentDigits(client, digits);
            if (existing && existing.id !== id) throw new ConflictError("DOCUMENT_TAKEN");
        }
        const row = await updateClientRow(client, id, {
            ...merged,
            name: merged.name.trim(),
        });
        if (!row) return null;
        const changedFields = AUDITED_CLIENT_FIELDS.filter((field) => Object.hasOwn(value, field));
        await recordAuditEvent(client, {
            action: CLIENT_AUDIT_ACTIONS.UPDATED,
            entityId: id,
            actor: user,
            context,
            metadata: { changedFields },
        });
        return toClient(row);
    });
}
