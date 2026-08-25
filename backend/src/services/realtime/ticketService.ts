import { createHash, randomBytes } from "node:crypto";
import { findActiveTenant, withTenantTransaction, type Tenant } from "@/lib/db/tenant";
import type { AuthUser, OrderSession } from "@/lib/types";
import { insertRealtimeTicketRow, consumeRealtimeTicketRow } from "@/models/realtimeTicketsModel";
import { findOrderSessionRow, listOrderSessionItemRowsBySession } from "@/models/ordersModel";
import { findUserRowById } from "@/models/usersModel";
import { canAccessOrderSession } from "@/services/orders/orderSessionService";
import { toOrderSession } from "@/services/orders/orderMapper";
import { ForbiddenError, NotFoundError } from "@/services/shared/errors";

const TICKET_TTL_MS = 60_000;

interface UpdatesRealtimeTicket {
    tenant: Tenant;
    user: AuthUser;
    expiresAt: number;
}

const globalForRealtimeTickets = globalThis as unknown as {
    __updatesRealtimeTickets?: Map<string, UpdatesRealtimeTicket>;
};
const updatesRealtimeTickets = globalForRealtimeTickets.__updatesRealtimeTickets
    ?? (globalForRealtimeTickets.__updatesRealtimeTickets = new Map());

function digest(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

export async function mintRealtimeTicket(tenant: Tenant, actor: AuthUser, sessionId: string): Promise<{ token: string }> {
    const allowed = await canAccessOrderSession(tenant, actor, sessionId);
    if (!allowed) throw new ForbiddenError();
    const token = randomBytes(24).toString("hex");
    await withTenantTransaction(tenant, actor, async (client) => {
        await insertRealtimeTicketRow(client, sessionId, actor.id, actor.role, digest(token), new Date(Date.now() + TICKET_TTL_MS));
    });
    return { token };
}

/** Ticket de uso único para o socket de atualizações de fila. */
export function mintUpdatesRealtimeTicket(tenant: Tenant, user: AuthUser): { token: string } {
    const token = randomBytes(24).toString("hex");
    updatesRealtimeTickets.set(token, { tenant, user, expiresAt: Date.now() + TICKET_TTL_MS });
    return { token };
}

export function consumeUpdatesRealtimeTicket(tenantSlug: string, token: string): UpdatesRealtimeTicket | null {
    const ticket = updatesRealtimeTickets.get(token);
    updatesRealtimeTickets.delete(token);
    if (!ticket || ticket.expiresAt < Date.now() || ticket.tenant.slug !== tenantSlug) return null;
    return ticket;
}

export interface ConsumedRealtimeTicket {
    tenant: Tenant;
    user: AuthUser;
    session: OrderSession;
}

/** Resolve o tenant pelo slug (o handshake do socket não tem cookie de tenant) e consome o ticket na mesma transação que já busca o snapshot atual da sessão. */
export async function consumeRealtimeTicket(tenantSlug: string, rawToken: string): Promise<ConsumedRealtimeTicket | null> {
    const tenant = await findActiveTenant(tenantSlug);
    if (!tenant) return null;
    return withTenantTransaction(tenant, {}, async (client) => {
        const ticket = await consumeRealtimeTicketRow(client, digest(rawToken));
        if (!ticket) return null;
        const userRow = await findUserRowById(client, ticket.user_id);
        if (!userRow) throw new NotFoundError("USER_NOT_FOUND");
        const sessionRow = await findOrderSessionRow(client, ticket.order_session_id);
        if (!sessionRow) throw new NotFoundError("SESSION_NOT_FOUND");
        const items = (await listOrderSessionItemRowsBySession(client, ticket.order_session_id)).map((item) => item.snapshot);
        return {
            tenant,
            user: {
                id: userRow.id,
                email: userRow.email,
                name: userRow.name,
                role: userRow.role,
                clientId: userRow.client_id ?? undefined,
                permissions: userRow.permissions,
            },
            session: toOrderSession(sessionRow, items),
        };
    });
}
