import type { Server, Namespace } from "socket.io";
import type { AuthUser } from "@/lib/types";
import type { OrderSessionParticipant } from "@/lib/types";
import type { Tenant } from "@/lib/db/tenant";
import * as orders from "@/services/orders";
import {
    consumeRealtimeTicket,
    type ConsumedRealtimeTicket,
} from "@/services/realtime/ticketService";
import {
    registerPedidosNamespace,
    sessionRoom,
} from "@/services/realtime/sessionBroadcast";

interface PedidosSocketData {
    tenant: Tenant;
    user: AuthUser;
    sessionId: string;
    initialSnapshot: ConsumedRealtimeTicket["session"];
}

interface PresenceEntry {
    userId: string;
    role: AuthUser["role"];
    name: string;
}

// Molde de sockets/propostas.js (auth por token no handshake, sala por
// entidade, snapshot completo no join) + sockets/carrinhos.js (entrar/sair/
// disconnect), com um roster de presença que o app de referência não tinha.
export function setupPedidosNamespace(io: Server): Namespace {
    const ns = io.of("/pedidos");
    const presence = new Map<string, Map<string, PresenceEntry>>();

    function presenceList(sessionId: string): PresenceEntry[] {
        const people = new Map<string, PresenceEntry>();
        for (const person of presence.get(sessionId)?.values() ?? [])
            people.set(person.userId, person);
        return Array.from(people.values());
    }

    function broadcastPresence(sessionId: string) {
        ns.to(sessionRoom(sessionId)).emit(
            "presenca_atualizada",
            presenceList(sessionId),
        );
    }

    async function broadcastParticipants(
        tenant: Tenant,
        user: AuthUser,
        sessionId: string,
    ) {
        const participants: OrderSessionParticipant[] = await orders.sessionParticipants(
            tenant,
            user,
            sessionId,
        );
        ns.to(sessionRoom(sessionId)).emit("participantes_atualizados", participants);
    }

    ns.use(async (socket, next) => {
        const auth = socket.handshake.auth ?? {};
        const query = socket.handshake.query ?? {};
        const tenantSlug = String(auth.tenantSlug ?? query.tenantSlug ?? "");
        const ticket = String(auth.ticket ?? query.ticket ?? "");
        if (!tenantSlug || !ticket) return next(new Error("Ticket inválido."));
        const consumed = await consumeRealtimeTicket(tenantSlug, ticket).catch(
            () => null,
        );
        if (!consumed) return next(new Error("Ticket inválido ou expirado."));
        const data: PedidosSocketData = {
            tenant: consumed.tenant,
            user: consumed.user,
            sessionId: consumed.session.id,
            initialSnapshot: consumed.session,
        };
        socket.data = data;
        next();
    });

    ns.on("connection", (socket) => {
        const { user, sessionId, initialSnapshot } =
            socket.data as PedidosSocketData;
        let joined = false;

        async function leaveRoom() {
            if (!joined) return;
            joined = false;
            const room = presence.get(sessionId);
            const hasAnotherConnection = Array.from(room?.entries() ?? [])
                .some(([socketId, person]) => socketId !== socket.id && person.userId === user.id);
            room?.delete(socket.id);
            if (room?.size === 0) presence.delete(sessionId);
            socket.leave(sessionRoom(sessionId));
            broadcastPresence(sessionId);
            if (!hasAnotherConnection) {
                await orders.leaveSessionParticipant(
                    (socket.data as PedidosSocketData).tenant,
                    user,
                    sessionId,
                );
                await broadcastParticipants(
                    (socket.data as PedidosSocketData).tenant,
                    user,
                    sessionId,
                );
            }
        }

        socket.on(
            "entrar_sessao",
            async (_payload: unknown, ack?: (res: { ok: boolean }) => void) => {
                if (joined) return ack?.({ ok: true });
                try {
                    const { tenant } = socket.data as PedidosSocketData;
                    const userIsAlreadyPresent = Array.from(
                        presence.get(sessionId)?.values() ?? [],
                    ).some((person) => person.userId === user.id);
                    if (!userIsAlreadyPresent)
                        await orders.registerSessionParticipant(tenant, user, sessionId);
                    socket.join(sessionRoom(sessionId));
                    joined = true;
                    if (!presence.has(sessionId))
                        presence.set(sessionId, new Map());
                    presence
                        .get(sessionId)!
                        .set(socket.id, {
                            userId: user.id,
                            role: user.role,
                            name: user.name,
                        });
                    socket.emit("sessao_snapshot", initialSnapshot);
                    broadcastPresence(sessionId);
                    await broadcastParticipants(tenant, user, sessionId);
                    ack?.({ ok: true });
                } catch {
                    ack?.({ ok: false });
                    socket.disconnect(true);
                }
            },
        );

        // As mutações (mais importante: alteração de itens) chamam a MESMA
        // função de serviço que PUT /sessions/:id — ela já valida papel/RLS
        // e já dispara o broadcast (via scheduleSessionBroadcast dentro de
        // orderSessionService.ts), então não repetimos isso aqui.
        socket.on(
            "atualizar_sessao",
            async (
                payload: unknown,
                ack?: (res: { ok: boolean; motivo?: string }) => void,
            ) => {
                try {
                    const { tenant, user: actor } =
                        socket.data as PedidosSocketData;
                    await orders.updateSession(
                        tenant,
                        actor,
                        sessionId,
                        (payload ?? {}) as Partial<
                            import("@/lib/types").OrderSession
                        >,
                    );
                    ack?.({ ok: true });
                } catch (error) {
                    ack?.({
                        ok: false,
                        motivo:
                            error instanceof Error
                                ? error.message
                                : "erro-interno",
                    });
                }
            },
        );

        socket.on("sair_sessao", () => {
            void leaveRoom();
        });

        socket.on("disconnect", () => {
            void leaveRoom();
        });
    });

    registerPedidosNamespace(ns);
    return ns;
}
