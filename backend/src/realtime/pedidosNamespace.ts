import { randomUUID } from "node:crypto";
import { logger, errorMeta } from "@/lib/logger";
import type { AuthUser } from "@/lib/types";
import type { OrderSession, OrderSessionParticipant } from "@/lib/types";
import type { PedidoPresence } from "@/contracts/realtime";
import type { PedidosNamespace, PedidosSocketData, RealtimeServer } from "@/realtime/types";
import * as orders from "@/services/orders";
import { consumeRealtimeTicket } from "@/services/realtime/ticketService";
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

    // Presença sai dos sockets que estão na room do pedido, não de um Map
    // deste processo: com o adapter Redis (redisAdapter.ts), fetchSockets()
    // devolve os sockets de TODAS as Machines. Um Map local somado ao
    // broadcast que agora atravessa Machines faria cada uma anunciar o SEU
    // roster parcial pra todo mundo — e a tela ficaria alternando entre as
    // duas listas.
    interface SessionMembers {
        /** "local" = o adapter não respondeu e a lista tem só os sockets desta
         * Machine (ver broadcastPresence). */
        scope: "cluster" | "local";
        users: AuthUser[];
    }

    async function sessionMembers(sessionId: string, scope: SessionMembers["scope"] = "cluster"): Promise<SessionMembers> {
        const room = sessionRoom(sessionId);
        if (scope === "cluster") {
            try {
                const sockets = await ns.in(room).fetchSockets();
                return { scope: "cluster", users: sockets.map((member) => member.data.user) };
            } catch (error) {
                logger.warn("pedidos-namespace", "Presença sem as outras Machines: o adapter não respondeu.", errorMeta(error));
            }
        }
        const sockets = await ns.local.in(room).fetchSockets();
        return { scope: "local", users: sockets.map((member) => member.data.user) };
    }

    function presenceOf(users: AuthUser[]): PedidoPresence[] {
        const people = new Map<string, PedidoPresence>();
        for (const person of users)
            people.set(person.id, { userId: person.id, role: person.role, name: person.name });
        return Array.from(people.values());
    }

    /** Lista parcial ("local") só é anunciada nesta Machine: mandada pro
     * cluster, ela sobrescreveria o roster completo que as outras anunciam. */
    function broadcastPresence(sessionId: string, members: SessionMembers): void {
        const target = members.scope === "cluster" ? ns : ns.local;
        target.to(sessionRoom(sessionId)).emit("presenca_atualizada", presenceOf(members.users));
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
        // Aceita os dois tipos de ticket — o de um pedido e o sem pedido, da
        // cliente que ainda vai criar o seu — numa transação só (ver
        // consumeRealtimeTicket em ticketService.ts).
        const consumed = await consumeRealtimeTicket(tenantSlug, ticket).catch((error: unknown) => {
            logger.warn("pedidos-namespace", "Falha ao consumir ticket.", errorMeta(error));
            return null;
        });
        if (!consumed) return next(new Error("Ticket inválido ou expirado."));
        socket.data = consumed.session
            ? { tenant: consumed.tenant, user: consumed.user, sessionId: consumed.session.id, initialSnapshot: consumed.session }
            : { tenant: consumed.tenant, user: consumed.user, canCreateCustomerSession: consumed.user.role === "cliente" };
        next();
    });

    ns.on("connection", (socket) => {
        const { user } = socket.data;
        let sessionId = socket.data.sessionId;
        let initialSnapshot = socket.data.initialSnapshot;
        // O snapshot só serve pro join e já foi copiado acima. Tirar do
        // socket.data importa com o adapter: fetchSockets() serializa o `data`
        // de cada socket pra trafegar entre Machines, e o pedido inteiro iria
        // junto em toda consulta de presença.
        delete socket.data.initialSnapshot;
        let joined = false;

        async function leaveRoom(scope: SessionMembers["scope"] = "cluster") {
            if (!joined || !sessionId) return;
            joined = false;
            // No "disconnect" o Socket.IO já tirou o socket das rooms; no
            // "sair_sessao" é aqui. Nos dois caminhos a lista abaixo é só de
            // quem fica.
            socket.leave(sessionRoom(sessionId));
            const members = await sessionMembers(sessionId, scope);
            broadcastPresence(sessionId, members);
            // A mesma pessoa ainda pode estar no pedido por outra aba ou
            // dispositivo — possivelmente conectada em outra Machine.
            if (!members.users.some((person) => person.id === user.id)) {
                await orders.leaveSessionParticipant(socket.data.tenant, user, sessionId);
                await broadcastParticipants(socket.data.tenant, user, sessionId);
            }
        }

        async function enterSession(snapshot: OrderSession): Promise<void> {
            if (!sessionId || joined) return;
            const { tenant } = socket.data;
            // Consultado ANTES de entrar na room: a pergunta é se a pessoa já
            // estava no pedido por outra conexão.
            const members = await sessionMembers(sessionId);
            if (!members.users.some((person) => person.id === user.id))
                await orders.registerSessionParticipant(tenant, user, sessionId);
            socket.join(sessionRoom(sessionId));
            joined = true;
            socket.emit("sessao_snapshot", snapshot);
            broadcastPresence(sessionId, { ...members, users: [...members.users, user] });
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
                socket.data = { ...socket.data, sessionId, canCreateCustomerSession: false };
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

        socket.on("disconnect", (reason) => {
            // Desligamento desta Machine (deploy/restart, io.close() em
            // server.ts): o adapter já está se desinscrevendo do Redis, então
            // perguntar às outras Machines só esperaria o timeout. Fica o
            // comportamento de antes do adapter — só os sockets locais —, e a
            // presença se corrige quando a pessoa reconecta na outra Machine.
            const scope = reason === "server shutting down" ? "local" : "cluster";
            leaveRoom(scope).catch((error) => logger.error("pedidos-namespace", "Falha ao processar desconexão.", errorMeta(error)));
        });
    });

    registerPedidosNamespace(ns);
    return ns;
}
