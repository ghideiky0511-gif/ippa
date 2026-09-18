import { randomUUID } from "node:crypto";
import { logger, errorMeta } from "@/lib/logger";
import type { AuthUser } from "@/lib/types";
import type { OrderSession, OrderSessionParticipant } from "@/lib/types";
import type { PedidoPresence } from "@/contracts/realtime";
import type { PedidosNamespace, PedidosSocketData, RealtimeServer } from "@/realtime/types";
import * as orders from "@/services/orders";
import {
    consumeRealtimeTicket,
    consumeUpdatesRealtimeTicket,
} from "@/services/realtime/ticketService";
import {
    registerPedidosNamespace,
    sessionRoom,
} from "@/services/realtime/sessionBroadcast";

// Molde de sockets/propostas.js (auth por token no handshake, sala por
// entidade, snapshot completo no join) + sockets/carrinhos.js (entrar/sair/
// disconnect), com um roster de presença que o app de referência não tinha.
export function setupPedidosNamespace(io: RealtimeServer): PedidosNamespace {
    // Anotação explícita = padrão "Custom types for each namespace" da doc
    // (typescript.md): os eventos deste namespace não são os do Server.
    const ns: PedidosNamespace = io.of("/pedidos");
    const presence = new Map<string, Map<string, PedidoPresence>>();

    function presenceList(sessionId: string): PedidoPresence[] {
        const people = new Map<string, PedidoPresence>();
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
        tenant: PedidosSocketData["tenant"],
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
        // Só `handshake.auth`: `handshake.query` é sempre vazio desde que o
        // servidor descarta a requisição HTTP inicial por socket
        // (io.engine.on("connection") em server.ts, ver memory-usage.md).
        // Os dois hooks do frontend sempre mandam o ticket em `auth`.
        const auth = socket.handshake.auth ?? {};
        const tenantSlug = String(auth.tenantSlug ?? "");
        const ticket = String(auth.ticket ?? "");
        if (!tenantSlug || !ticket) return next(new Error("Ticket inválido."));
        const consumed = await consumeRealtimeTicket(tenantSlug, ticket).catch(
            () => null,
        );
        const cartTicket = consumed ? null : consumeUpdatesRealtimeTicket(tenantSlug, ticket);
        if (!consumed && !cartTicket) return next(new Error("Ticket inválido ou expirado."));
        socket.data = consumed
            ? { tenant: consumed.tenant, user: consumed.user, sessionId: consumed.session.id, initialSnapshot: consumed.session }
            : { tenant: cartTicket!.tenant, user: cartTicket!.user, canCreateCustomerSession: cartTicket!.user.role === "cliente" };
        next();
    });

    ns.on("connection", (socket) => {
        const { user } = socket.data;
        let sessionId = socket.data.sessionId;
        let initialSnapshot = socket.data.initialSnapshot;
        let joined = false;

        async function leaveRoom() {
            if (!joined || !sessionId) return;
            joined = false;
            const room = presence.get(sessionId);
            const hasAnotherConnection = Array.from(room?.entries() ?? [])
                .some(([socketId, person]) => socketId !== socket.id && person.userId === user.id);
            room?.delete(socket.id);
            if (room?.size === 0) presence.delete(sessionId);
            socket.leave(sessionRoom(sessionId));
            broadcastPresence(sessionId);
            if (!hasAnotherConnection) {
                await orders.leaveSessionParticipant(socket.data.tenant, user, sessionId);
                await broadcastParticipants(socket.data.tenant, user, sessionId);
            }
        }

        async function enterSession(snapshot: OrderSession): Promise<void> {
            if (!sessionId || joined) return;
            const { tenant } = socket.data;
            const userIsAlreadyPresent = Array.from(
                presence.get(sessionId)?.values() ?? [],
            ).some((person) => person.userId === user.id);
            if (!userIsAlreadyPresent)
                await orders.registerSessionParticipant(tenant, user, sessionId);
            socket.join(sessionRoom(sessionId));
            joined = true;
            if (!presence.has(sessionId)) presence.set(sessionId, new Map());
            presence.get(sessionId)!.set(socket.id, {
                userId: user.id,
                role: user.role,
                name: user.name,
            });
            socket.emit("sessao_snapshot", snapshot);
            broadcastPresence(sessionId);
            await broadcastParticipants(tenant, user, sessionId);
        }

        socket.on("entrar_sessao", async (_payload, ack) => {
            if (joined) return ack?.({ ok: true });
            if (!sessionId || !initialSnapshot) return ack?.({ ok: false });
            try {
                await enterSession(initialSnapshot);
                ack?.({ ok: true });
            } catch {
                ack?.({ ok: false });
                socket.disconnect(true);
            }
        });

        // A cliente autenticada entra sem carrinho local: a primeira inclusão
        // cria (ou recupera) sua única sessão online diretamente no socket.
        socket.on("criar_sessao_cliente", async (payload, ack) => {
            if (!socket.data.canCreateCustomerSession || user.role !== "cliente") {
                return ack?.({ ok: false, motivo: "Não autorizado." });
            }
            try {
                const { tenant } = socket.data;
                // `payload` é tipado, mas continua sendo entrada de rede: quem
                // valida de verdade é EnsureCustomerOrderSessionSchema dentro
                // do serviço (por isso ele recebe `unknown`).
                const session = await orders.ensureCustomerOrderSession(tenant, user, payload as unknown, { requestId: randomUUID() });
                // A ausência temporária de vendedora não impede a compra:
                // a cliente mantém o carrinho local e pode finalizar pelo
                // checkout direto. É um aviso de atendimento, não erro.
                if (!session) return ack?.({
                    ok: true,
                    pendingAssignment: true,
                    aviso: "Seu carrinho está salvo. Uma vendedora será notificada assim que estiver disponível para participar do atendimento online.",
                });
                sessionId = session.id;
                initialSnapshot = session;
                socket.data = { ...socket.data, sessionId, initialSnapshot, canCreateCustomerSession: false };
                await enterSession(session);
                ack?.({ ok: true, session });
            } catch (error) {
                ack?.({ ok: false, motivo: error instanceof Error ? error.message : "Erro ao criar pedido." });
            }
        });

        // As mutações (mais importante: alteração de itens) chamam a MESMA
        // função de serviço que PUT /sessions/:id — ela já valida papel/RLS
        // e já dispara o broadcast (via scheduleSessionBroadcast dentro de
        // orderSessionService.ts), então não repetimos isso aqui.
        socket.on("atualizar_sessao", async (payload, ack) => {
            try {
                if (!sessionId) throw new Error("Nenhum pedido ativo.");
                const { tenant, user: actor } = socket.data;
                // Mesmo raciocínio de `criar_sessao_cliente`: o generic é
                // garantia de compile-time, a validação de runtime é o Zod
                // dentro de updateSession.
                await orders.updateSession(tenant, actor, sessionId, (payload ?? {}) as unknown);
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
        });

        socket.on("sair_sessao", () => {
            leaveRoom().catch((error) => logger.error("pedidos-namespace", "Falha ao sair da sessão.", errorMeta(error)));
        });

        socket.on("disconnect", () => {
            leaveRoom().catch((error) => logger.error("pedidos-namespace", "Falha ao processar desconexão.", errorMeta(error)));
        });
    });

    registerPedidosNamespace(ns);
    return ns;
}
