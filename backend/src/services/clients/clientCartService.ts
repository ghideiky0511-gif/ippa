import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, CartItem } from "@/lib/types";
import { deleteClientCartRows, findClientRow, insertClientCartRow } from "@/models/clientsModel";
import { recordAuditEvent, CLIENT_CART_AUDIT_ACTIONS, type AuditRequestContext } from "@/services/audit";
import { ForbiddenError } from "@/services/shared/errors";

export async function saveClientCart(
    tenant: Tenant,
    user: AuthUser,
    id: string,
    items: CartItem[],
    context: AuditRequestContext,
): Promise<void> {
    if (user.clientId !== id) throw new ForbiddenError();
    await withTenantTransaction(tenant, user, async (client) => {
        if (!await findClientRow(client, id)) throw new Error("NOT_FOUND");
        await deleteClientCartRows(client, id);
        for (const item of items) await insertClientCartRow(client, id, item);
        await recordAuditEvent(client, {
            action: CLIENT_CART_AUDIT_ACTIONS.SAVED,
            entityId: id,
            actor: user,
            context,
            metadata: { itemCount: items.length },
        });
    });
}
