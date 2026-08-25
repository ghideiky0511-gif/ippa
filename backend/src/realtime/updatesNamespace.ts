import type { Namespace, Server } from "socket.io";
import type { Tenant } from "@/lib/db/tenant";
import type { AuthUser } from "@/lib/types";
import { consumeUpdatesRealtimeTicket } from "@/services/realtime/ticketService";
import { registerUpdatesNamespace, updatesRoomsForUser } from "@/services/realtime/updateBroadcast";

export function setupUpdatesNamespace(io: Server): Namespace {
    const namespace = io.of("/atualizacoes");

    namespace.use((socket, next) => {
        const auth = socket.handshake.auth ?? {};
        const query = socket.handshake.query ?? {};
        const tenantSlug = String(auth.tenantSlug ?? query.tenantSlug ?? "");
        const ticket = String(auth.ticket ?? query.ticket ?? "");
        if (!tenantSlug || !ticket) return next(new Error("Ticket inválido."));
        const consumed = consumeUpdatesRealtimeTicket(tenantSlug, ticket);
        if (!consumed) return next(new Error("Ticket inválido ou expirado."));
        socket.data = consumed;
        next();
    });

    namespace.on("connection", (socket) => {
        const { tenant, user } = socket.data as { tenant: Tenant; user: AuthUser };
        socket.join(updatesRoomsForUser(tenant.id, user));
    });

    registerUpdatesNamespace(namespace);
    return namespace;
}
