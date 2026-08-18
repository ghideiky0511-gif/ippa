import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, OrderSession } from "@/lib/types";
import {
    insertOrderSessionItemRow,
    insertOrderSessionRow,
    listOrderSessionItemRows,
    listOrderSessionRowsBySeller,
} from "@/models/ordersModel";
import { recordAuditEvent, ORDER_SESSION_AUDIT_ACTIONS, type AuditRequestContext } from "@/services/audit";
import { ForbiddenError } from "@/services/shared/errors";
import { toOrderSession } from "./orderMapper";

export async function sellerSessions(tenant: Tenant, user: AuthUser): Promise<OrderSession[]> {
    if (user.role !== "vendedora") throw new ForbiddenError();
    return withTenantTransaction(tenant, user, async (client) => {
        const [sessions, items] = await Promise.all([
            listOrderSessionRowsBySeller(client, user.id),
            listOrderSessionItemRows(client),
        ]);
        return sessions.map((session) => toOrderSession(
            session,
            items.filter((item) => item.session_id === session.id).map((item) => item.snapshot),
        ));
    });
}

export async function createSellerSession(
    tenant: Tenant,
    user: AuthUser,
    body: Partial<OrderSession>,
    context: AuditRequestContext,
): Promise<OrderSession> {
    if (user.role !== "vendedora") throw new ForbiddenError();
    return withTenantTransaction(tenant, user, async (client) => {
        const items = Array.isArray(body.items) ? body.items : [];
        const row = await insertOrderSessionRow(client, {
            clientName: typeof body.clientName === "string" && body.clientName.trim()
                ? body.clientName.trim() : "Sem cliente",
            clientId: body.clientId,
            sellerId: user.id,
            channel: body.channel === "whatsapp" || body.channel === "online" ? body.channel : "presencial",
            status: "aberto",
            shipping: undefined,
            notes: body.notes,
        });
        for (const item of items) await insertOrderSessionItemRow(client, row.id, item);
        const created = toOrderSession(row, items);
        await recordAuditEvent(client, {
            action: ORDER_SESSION_AUDIT_ACTIONS.CREATED,
            entityId: created.id,
            actor: user,
            context,
            metadata: {
                channel: created.channel,
                hasClient: Boolean(created.clientId),
                itemCount: created.items.length,
            },
        });
        return created;
    });
}
