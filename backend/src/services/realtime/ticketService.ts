import { createHash, randomBytes } from "node:crypto";
import { findActiveTenant, withTenantTransaction, type Tenant } from "@/lib/db/tenant";
import type { AuthUser, OrderSession } from "@/lib/types";
import {
    consumeRealtimeTicketRow,
    deleteExpiredRealtimeTicketRows,
    insertRealtimeTicketRow,
    type RealtimeTicketRow,
} from "@/models/realtimeTicketsModel";
import { findOrderSessionRow, listOrderSessionItemRowsBySession } from "@/models/ordersModel";
import { findUserRowById, type UserRow } from "@/models/usersModel";
import { canAccessOrderSession } from "@/services/orders/orderSessionService";
import { toOrderSession } from "@/services/orders/orderMapper";
import { ForbiddenError, NotFoundError } from "@/services/shared/errors";
import type { PoolClient } from "pg";

// Os DOIS tipos de ticket vivem em Postgres (tabela realtime_tickets). O de
// atualizações já morou num Map em memória, e isso só funcionava com um
// processo: quem minera o ticket é uma requisição HTTP e quem consome é o
// handshake do WebSocket — conexões separadas que o proxy do Fly roteia de
// forma independente. Com duas Machines, metade dos handshakes caía na
// Machine que nunca tinha visto o token. Não é Redis de propósito: o Redis
// daqui é best-effort (lib/redis.ts falha aberto como "cache miss"), e um
// store de autenticação não pode falhar aberto.
const TICKET_TTL_MS = 60_000;

function digest(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

function toAuthUser(row: UserRow): AuthUser {
    return {
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        clientId: row.client_id ?? undefined,
        permissions: row.permissions,
    };
}

async function mint(tenant: Tenant, actor: AuthUser, orderSessionId: string | null): Promise<{ token: string }> {
    const token = randomBytes(24).toString("hex");
    await withTenantTransaction(tenant, actor, async (client) => {
        await deleteExpiredRealtimeTicketRows(client, actor.id);
        await insertRealtimeTicketRow(client, orderSessionId, actor.id, actor.role, digest(token), new Date(Date.now() + TICKET_TTL_MS));
    });
    return { token };
}

/** Ticket de uso único para entrar na sala de um pedido específico (/pedidos). */
export async function mintRealtimeTicket(tenant: Tenant, actor: AuthUser, sessionId: string): Promise<{ token: string }> {
    const allowed = await canAccessOrderSession(tenant, actor, sessionId);
    if (!allowed) throw new ForbiddenError();
    return mint(tenant, actor, sessionId);
}

/** Ticket de uso único sem pedido: socket de atualizações de fila
 * (/atualizacoes) e a cliente que entra em /pedidos antes de ter pedido. */
export async function mintUpdatesRealtimeTicket(tenant: Tenant, user: AuthUser): Promise<{ token: string }> {
    return mint(tenant, user, null);
}

export interface ConsumedUpdatesRealtimeTicket {
    tenant: Tenant;
    user: AuthUser;
}

export interface ConsumedRealtimeTicket extends ConsumedUpdatesRealtimeTicket {
    /** Ausente quando o ticket era de atualizações (cliente sem pedido). */
    session?: OrderSession;
}

async function loadTicketUser(client: PoolClient, ticket: RealtimeTicketRow): Promise<AuthUser> {
    const userRow = await findUserRowById(client, ticket.user_id);
    if (!userRow) throw new NotFoundError("USER_NOT_FOUND");
    return toAuthUser(userRow);
}

/** /atualizacoes: só aceita o ticket sem pedido. O tenant vem do slug (o
 * handshake do socket não tem cookie de tenant) e a RLS garante que o ticket
 * é daquele tenant. */
export async function consumeUpdatesRealtimeTicket(tenantSlug: string, rawToken: string): Promise<ConsumedUpdatesRealtimeTicket | null> {
    const tenant = await findActiveTenant(tenantSlug);
    if (!tenant) return null;
    return withTenantTransaction(tenant, {}, async (client) => {
        const ticket = await consumeRealtimeTicketRow(client, digest(rawToken), "updates");
        if (!ticket) return null;
        return { tenant, user: await loadTicketUser(client, ticket) };
    });
}

/** /pedidos: aceita os dois tipos numa transação só — o de sessão (já traz o
 * snapshot atual do pedido, pro `sessao_snapshot` do join) e o de
 * atualizações (cliente sem pedido, que cria o seu via `criar_sessao_cliente`).
 * Uma transação só importa: é o handshake, e o pool é o recurso que já
 * esgotou numa rajada de reconexões. */
export async function consumeRealtimeTicket(tenantSlug: string, rawToken: string): Promise<ConsumedRealtimeTicket | null> {
    const tenant = await findActiveTenant(tenantSlug);
    if (!tenant) return null;
    return withTenantTransaction(tenant, {}, async (client) => {
        const ticket = await consumeRealtimeTicketRow(client, digest(rawToken), "any");
        if (!ticket) return null;
        const user = await loadTicketUser(client, ticket);
        if (!ticket.order_session_id) return { tenant, user };
        const sessionRow = await findOrderSessionRow(client, ticket.order_session_id);
        if (!sessionRow) throw new NotFoundError("SESSION_NOT_FOUND");
        const items = (await listOrderSessionItemRowsBySession(client, ticket.order_session_id)).map((item) => item.snapshot);
        return { tenant, user, session: toOrderSession(sessionRow, items) };
    });
}
