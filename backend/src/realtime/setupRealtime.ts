import type { Server as HttpServer } from "node:http";
import { Server, type ServerOptions } from "socket.io";
import type { RealtimeInterServerEvents } from "@/contracts/realtime";
import { forgetTenantLocally, setTenantCachePeerNotifier } from "@/lib/db/tenant";
import { setupPedidosNamespace } from "@/realtime/pedidosNamespace";
import { createRealtimeCluster } from "@/realtime/redisAdapter";
import type { RealtimeServer, RealtimeSocketData } from "@/realtime/types";
import { setupUpdatesNamespace } from "@/realtime/updatesNamespace";

// Montagem do Socket.IO inteira num lugar só, fora do server.ts, pra que o
// teste de cluster (scripts/testar-realtime-cluster.ts) suba cada instância
// EXATAMENTE como a produção sobe — adapter, namespaces, aviso de tenant entre
// Machines e ordem do shutdown — em vez de uma cópia que divergiria.

export interface RealtimeRuntime {
    io: RealtimeServer;
    /** "redis" = broadcast entre Machines; "memory" = um processo só. */
    adapter: "redis" | "memory";
    /** Desconecta cada socket com o motivo `server shutting down`, fecha o
     * httpServer e, por último, as conexões do adapter. */
    close(): Promise<void>;
}

export interface RealtimeOptions {
    cors: ServerOptions["cors"];
    /** Padrão: process.env.REDIS_URL. Sem valor, adapter em memória. */
    redisUrl?: string;
}

export function setupRealtime(httpServer: HttpServer, options: RealtimeOptions): RealtimeRuntime {
    // Adapter Redis quando há REDIS_URL (ver redisAdapter.ts): é o que faz um
    // broadcast emitido numa Machine chegar aos sockets conectados nas outras.
    // Sem REDIS_URL, adapter em memória — correto pra um processo só (dev
    // local).
    const cluster = createRealtimeCluster(options.redisUrl ?? process.env.REDIS_URL);

    // Os quatro generics (ListenEvents, EmitEvents, ServerSideEvents,
    // SocketData) do namespace RAIZ, que não recebe sockets — os dois canais
    // reais são /pedidos e /atualizacoes, cada um com seus próprios tipos
    // (ver types.ts, padrão "Custom types for each namespace" de
    // socket.io/doc/typescript.md). Mapas cliente↔servidor vazios no raiz
    // fazem qualquer `io.emit(...)` acidental virar erro de compilação em vez
    // de um evento que ninguém escuta.
    //
    // pingInterval/pingTimeout ficam no padrão (25s/20s = 45s): a checagem
    // que a doc manda fazer (proxy com idle timeout menor que a soma, ver
    // socket.io/doc/troubleshooting.md) deu negativo — o fly-proxy não fecha
    // mais conexão TCP por ociosidade desde 2023-09-01
    // (community.fly.io/t/tcp-idle-timeouts-restrictions-have-been-removed/15160).
    const io: RealtimeServer = new Server<
        Record<string, never>,
        Record<string, never>,
        RealtimeInterServerEvents,
        RealtimeSocketData
    >(httpServer, {
        cors: options.cors,
        ...(cluster ? { adapter: cluster.adapter } : {}),
    });

    // Descarta a requisição HTTP do handshake, que o Socket.IO guardaria pela
    // vida inteira de cada conexão (socket.io/doc/memory-usage.md). Nada aqui
    // precisa dela depois do handshake: a autenticação é por ticket em
    // `handshake.auth`, não por sessão HTTP anexada ao socket. Efeito
    // colateral assumido: `handshake.query`/`handshake.headers` ficam vazios,
    // por isso os middlewares dos dois namespaces leem só `handshake.auth`.
    io.engine.on("connection", (rawSocket: { request: unknown }) => {
        rawSocket.request = null;
    });

    setupPedidosNamespace(io);
    setupUpdatesNamespace(io);

    if (cluster) {
        // O cache slug → tenant (lib/db/tenant.ts) é por processo. Quando um
        // tenant muda de status, a Machine que processou a mudança avisa as
        // outras por aqui, em vez de elas servirem o dado velho até o TTL. O
        // Socket.IO não entrega o serverSideEmit pra quem emitiu, e quem
        // recebe só limpa localmente — o aviso não fica quicando.
        io.on("tenant_invalidated", (slug) => forgetTenantLocally(slug));
        setTenantCachePeerNotifier((slug) => io.serverSideEmit("tenant_invalidated", slug));
    }

    return {
        io,
        adapter: cluster ? "redis" : "memory",
        async close() {
            // Fechar só o httpServer NÃO desconecta quem já está em WebSocket
            // — a própria doc avisa ("Only closing the underlying HTTP server
            // is not sufficient...", socket.io/doc/server-api.md). `io.close()`
            // encerra cada socket com o motivo nativo `server shutting down`,
            // desinscreve o adapter dos canais Redis e fecha o httpServer.
            await io.close();
            // Só depois do io.close(): até ali as conexões Redis ainda são
            // usadas (a desinscrição passa por elas).
            setTenantCachePeerNotifier(undefined);
            cluster?.close();
        },
    };
}
