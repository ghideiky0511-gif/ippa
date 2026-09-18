import type { RealtimeServer, UpdatesNamespace } from "@/realtime/types";
import { consumeUpdatesRealtimeTicket } from "@/services/realtime/ticketService";
import { registerUpdatesNamespace, updatesRoomsForUser } from "@/services/realtime/updateBroadcast";

export function setupUpdatesNamespace(io: RealtimeServer): UpdatesNamespace {
    const namespace: UpdatesNamespace = io.of("/atualizacoes");

    namespace.use((socket, next) => {
        // Só `handshake.auth` — ver o comentário equivalente em
        // pedidosNamespace.ts: a requisição HTTP inicial é descartada por
        // socket (memory-usage.md), então `handshake.query` fica vazio.
        const auth = socket.handshake.auth ?? {};
        const tenantSlug = String(auth.tenantSlug ?? "");
        const ticket = String(auth.ticket ?? "");
        if (!tenantSlug || !ticket) return next(new Error("Ticket inválido."));
        const consumed = consumeUpdatesRealtimeTicket(tenantSlug, ticket);
        if (!consumed) return next(new Error("Ticket inválido ou expirado."));
        socket.data = { tenant: consumed.tenant, user: consumed.user };
        next();
    });

    namespace.on("connection", (socket) => {
        const { tenant, user } = socket.data;
        socket.join(updatesRoomsForUser(tenant.id, user));
    });

    registerUpdatesNamespace(namespace);
    return namespace;
}
