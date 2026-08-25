import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, CommercialGroup, CommercialGroupMemberWithClient, CommercialGroupWithMembers } from "@/lib/types";
import { CreateCommercialGroupInputSchema, UpdateCommercialGroupInputSchema } from "@/contracts/commercialGroups";
import {
    findCommercialGroupRow,
    insertCommercialGroupRow,
    listCommercialGroupRows,
    setCommercialGroupActiveRow,
    updateCommercialGroupRow,
} from "@/models/commercialGroupsModel";
import { deactivateAllCommercialGroupMemberRowsForGroup, listCommercialGroupMemberRows } from "@/models/commercialGroupMembersModel";
import { findClientRow } from "@/models/clientsModel";
import { recordAuditEvent, COMMERCIAL_GROUP_AUDIT_ACTIONS, type AuditRequestContext } from "@/services/audit";
import { ForbiddenError, ValidationError } from "@/services/shared/errors";
import { toCommercialGroup, toCommercialGroupMemberWithClient } from "./commercialGroupMapper";

export function canManageCommercialGroups(user: AuthUser): boolean {
    return user.role !== "cliente";
}

export async function listCommercialGroups(tenant: Tenant, user: AuthUser, query?: string, includeInactive?: boolean): Promise<CommercialGroup[]> {
    if (!canManageCommercialGroups(user)) throw new ForbiddenError();
    return withTenantTransaction(tenant, user, async (client) =>
        (await listCommercialGroupRows(client, query?.trim() || null, includeInactive ?? false)).map(toCommercialGroup),
    );
}

export async function getCommercialGroup(tenant: Tenant, user: AuthUser, id: string): Promise<CommercialGroupWithMembers | null> {
    if (!canManageCommercialGroups(user)) throw new ForbiddenError();
    return withTenantTransaction(tenant, user, async (client) => {
        const row = await findCommercialGroupRow(client, id);
        if (!row) return null;
        const memberRows = await listCommercialGroupMemberRows(client, id, false);
        const members: CommercialGroupMemberWithClient[] = [];
        for (const memberRow of memberRows) {
            const clientRow = await findClientRow(client, memberRow.client_id);
            if (clientRow) members.push(toCommercialGroupMemberWithClient(memberRow, clientRow));
        }
        return { ...toCommercialGroup(row), members };
    });
}

export async function createCommercialGroup(
    tenant: Tenant,
    user: AuthUser,
    value: unknown,
    context: AuditRequestContext,
): Promise<CommercialGroup> {
    if (!canManageCommercialGroups(user)) throw new ForbiddenError();
    const parsed = CreateCommercialGroupInputSchema.safeParse(value);
    if (!parsed.success) throw new ValidationError("INVALID_INPUT", "Dados inválidos.", parsed.error.issues);
    return withTenantTransaction(tenant, user, async (client) => {
        const created = toCommercialGroup(await insertCommercialGroupRow(client, { name: parsed.data.name }));
        await recordAuditEvent(client, {
            action: COMMERCIAL_GROUP_AUDIT_ACTIONS.CREATED,
            entityId: created.id,
            actor: user,
            context,
        });
        return created;
    });
}

export async function updateCommercialGroup(
    tenant: Tenant,
    user: AuthUser,
    id: string,
    value: unknown,
    context: AuditRequestContext,
): Promise<CommercialGroup | null> {
    if (!canManageCommercialGroups(user)) throw new ForbiddenError();
    const parsed = UpdateCommercialGroupInputSchema.safeParse(value);
    if (!parsed.success) throw new ValidationError("INVALID_INPUT", "Dados inválidos.", parsed.error.issues);
    return withTenantTransaction(tenant, user, async (client) => {
        const row = await updateCommercialGroupRow(client, id, parsed.data);
        if (!row) return null;
        await recordAuditEvent(client, {
            action: COMMERCIAL_GROUP_AUDIT_ACTIONS.UPDATED,
            entityId: id,
            actor: user,
            context,
            metadata: { changedFields: Object.keys(parsed.data) },
        });
        return toCommercialGroup(row);
    });
}

// Ao desativar o grupo, também desativa todos os membros na mesma
// transação — senão eles ficam "presos" pelo índice único de membership
// ativa (commercial_group_members_client_active_unique) mesmo com o grupo
// já inativo, e nunca conseguem entrar em outro grupo.
export async function setCommercialGroupActive(
    tenant: Tenant,
    user: AuthUser,
    id: string,
    isActive: boolean,
    context: AuditRequestContext,
): Promise<CommercialGroup | null> {
    if (!canManageCommercialGroups(user)) throw new ForbiddenError();
    return withTenantTransaction(tenant, user, async (client) => {
        const row = await setCommercialGroupActiveRow(client, id, isActive);
        if (!row) return null;
        if (!isActive) await deactivateAllCommercialGroupMemberRowsForGroup(client, id);
        await recordAuditEvent(client, {
            action: isActive ? COMMERCIAL_GROUP_AUDIT_ACTIONS.ACTIVATED : COMMERCIAL_GROUP_AUDIT_ACTIONS.DEACTIVATED,
            entityId: id,
            actor: user,
            context,
        });
        return toCommercialGroup(row);
    });
}
