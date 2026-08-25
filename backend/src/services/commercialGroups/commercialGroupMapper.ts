import type { CommercialGroup, CommercialGroupMember, CommercialGroupMemberWithClient } from "@/lib/types";
import type { CommercialGroupRow } from "@/models/commercialGroupsModel";
import type { CommercialGroupMemberRow } from "@/models/commercialGroupMembersModel";
import type { ClientRow } from "@/models/clientsModel";
import { toClient } from "@/services/clients/clientMapper";

export function toCommercialGroup(row: CommercialGroupRow): CommercialGroup {
    return {
        id: row.id,
        name: row.name,
        groupType: "client",
        isActive: row.is_active,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
    };
}

export function toCommercialGroupMember(row: CommercialGroupMemberRow): CommercialGroupMember {
    return {
        id: row.id,
        groupId: row.group_id,
        clientId: row.client_id,
        isPrimary: row.is_primary,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
    };
}

export function toCommercialGroupMemberWithClient(row: CommercialGroupMemberRow, clientRow: ClientRow): CommercialGroupMemberWithClient {
    return { ...toCommercialGroupMember(row), client: toClient(clientRow) };
}
