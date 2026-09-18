import { errorMeta, logger } from "@/lib/logger";
import type { RealtimeServer, UpdatesNamespace } from "@/realtime/types";
import { consumeUpdatesRealtimeTicket } from "@/services/realtime/ticketService";
import { registerUpdatesNamespace, updatesRoomsForUser } from "@/services/realtime/updateBroadcast";

export function setupUpdatesNamespace(io: RealtimeServer): UpdatesNamespace {
    const namespace: UpdatesNamespace = io.of("/atualizacoes");

    namespace.use(async (socket, next) => {
        // Só `handshake.auth` — ver o comentário equivalente em
        // pedidosNamespace.ts: a requisição HTTP inicial é descartada por
        // socket (memory-usage.md), então `handshake.query` fica vazio.
        const auth = socket.handshake.auth ?? {};
        const tenantSlug = String(auth.tenantSlug ?? "");
        const ticket = String(auth.ticket ?? "");
        if (!tenantSlug || !ticket) return next(new Error("Ticket inválido."));
        // O ticket mora em Postgres, não num Map deste processo: quem minerou
        // (POST /realtime-ticket) pode ter sido a outra Machine (ver
        // ticketService.ts). O catch é obrigatório — o Socket.IO não trata
        // rejeição de middleware async, e ela viraria unhandled rejection.
        const consumed = await consumeUpdatesRealtimeTicket(tenantSlug, ticket).catch((error: unknown) => {
            logger.warn("updates-namespace", "Falha ao consumir ticket.", errorMeta(error));
            return null;
        });
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
