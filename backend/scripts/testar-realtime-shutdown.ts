/**
 * Verifica, contra a lib de verdade (socket.io 4.8.3 + socket.io-client), as
 * quatro suposições de biblioteca em que a auditoria de realtime se apoiou.
 * Não sobe o Next nem toca no banco: é o comportamento do Socket.IO que está
 * sendo checado, não a regra de negócio (essa fica em
 * src/services/realtime/updateBroadcast.test.ts).
 *
 *   npx tsx scripts/testar-realtime-shutdown.ts
 *
 * 1. `io.close()` desconecta quem já está em WebSocket e o motivo servidor é
 *    `server shutting down` (server-api.md) — é o que sustenta o handler de
 *    SIGTERM em server.ts (via setupRealtime.ts).
 * 2. Depois do close, conexão nova é recusada.
 * 3. `to([roomA, roomB]).emit(...)` entrega UMA vez a quem está nas duas rooms
 *    (rooms.md) — é o que corrigiu a entrega dupla pra administrador em
 *    updateBroadcast.ts.
 * 4. `io.engine.on("connection", s => { s.request = null })` (memory-usage.md)
 *    não afeta `handshake.auth`, mas ESVAZIA `handshake.query` — por isso os
 *    middlewares dos namespaces leem só `auth`.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";

// Só o que este probe usa do socket.io-client. A lib é dependência do
// FRONTEND (o backend nunca conecta como cliente em produção), então é
// carregada pelo caminho do workspace vizinho em vez de virar uma
// devDependency a mais aqui — e por isso os tipos dela também não estão
// disponíveis pro tsc do backend, o que esta interface mínima resolve.
interface ProbeClient {
    on(event: "connect", listener: () => void): void;
    on(event: "connect_error", listener: (error: Error) => void): void;
    on(event: "disconnect", listener: (reason: string) => void): void;
    on(event: "ping_union", listener: (n: number) => void): void;
    emitWithAck(event: "quem_sou_eu"): Promise<{ auth: unknown; query: unknown }>;
    close(): void;
}

const requireFrom = createRequire(__filename);
const { io: connect } = requireFrom(
    "../../frontend/node_modules/socket.io-client/build/cjs/index.js",
) as { io: (url: string, options: Record<string, unknown>) => ProbeClient };

interface ProbeServerToClient {
    ping_union: (n: number) => void;
}
interface ProbeClientToServer {
    quem_sou_eu: (ack: (res: { auth: unknown; query: unknown }) => void) => void;
}

async function main(): Promise<void> {
    const httpServer = createServer();
    const io = new Server<ProbeClientToServer, ProbeServerToClient>(httpServer, {
        cors: { origin: true },
    });

    // Mesma otimização de memória aplicada em src/realtime/setupRealtime.ts.
    io.engine.on("connection", (rawSocket: { request: unknown }) => {
        rawSocket.request = null;
    });

    const disconnectReasons: string[] = [];
    const ns = io.of("/probe");
    ns.on("connection", (socket) => {
        // Um socket em DUAS rooms, como administrador (tenantRoom + sellerRoom).
        socket.join(["room:a", "room:b"]);
        socket.on("quem_sou_eu", (ack) => {
            ack({ auth: socket.handshake.auth, query: socket.handshake.query });
        });
        socket.on("disconnect", (reason) => disconnectReasons.push(reason));
    });

    await new Promise<void>((done) => httpServer.listen(0, "127.0.0.1", done));
    const port = (httpServer.address() as AddressInfo).port;
    const url = `http://127.0.0.1:${port}/probe`;

    function conectar() {
        return connect(url, {
            auth: { tenantSlug: "loja-teste", ticket: "t-123" },
            query: { tenantSlug: "veio-pela-query" },
            transports: ["websocket"],
            reconnection: false,
        });
    }

    const client = conectar();
    await new Promise<void>((done, fail) => {
        client.on("connect", () => done());
        client.on("connect_error", fail);
    });
    console.log("1/4 ok — conexão estabelecida");

    // --- 4) handshake depois de descartar a requisição HTTP -------------------
    const handshake = await client.emitWithAck("quem_sou_eu");
    assert.deepEqual(handshake.auth, { tenantSlug: "loja-teste", ticket: "t-123" }, "handshake.auth deveria sobreviver ao descarte da request");
    assert.deepEqual(handshake.query, {}, "handshake.query deveria ficar vazio depois de rawSocket.request = null");
    console.log("2/4 ok — handshake.auth intacto, handshake.query vazio (como documentado em src/realtime/setupRealtime.ts)");

    // --- 3) união de rooms entrega uma vez só --------------------------------
    let recebidos = 0;
    client.on("ping_union", () => { recebidos += 1; });
    ns.to(["room:a", "room:b"]).emit("ping_union", 1);
    await new Promise((done) => setTimeout(done, 200));
    assert.equal(recebidos, 1, `união de rooms deveria entregar 1 vez, entregou ${recebidos}`);
    console.log("3/4 ok — união de rooms entrega uma única vez a quem está nas duas");

    // --- 1) e 2) shutdown gracioso -------------------------------------------
    const clientDisconnected = new Promise<string>((done) => client.on("disconnect", done));
    const closing = io.close();
    httpServer.closeIdleConnections();
    await closing;
    const clientReason = await clientDisconnected;

    assert.deepEqual(disconnectReasons, ["server shutting down"], `motivo no servidor deveria ser "server shutting down", veio ${JSON.stringify(disconnectReasons)}`);
    console.log(`4/4 ok — io.close() desconectou o cliente (servidor: "${disconnectReasons[0]}", cliente: "${clientReason}")`);

    const recusado = await new Promise<boolean>((done) => {
        const tardio = conectar();
        tardio.on("connect", () => { tardio.close(); done(false); });
        tardio.on("connect_error", () => { tardio.close(); done(true); });
        setTimeout(() => { tardio.close(); done(true); }, 1_500);
    });
    assert.ok(recusado, "servidor fechado não deveria aceitar conexão nova");
    console.log("     ...e recusa conexão nova depois do close");

    client.close();
    console.log("\nTodas as suposições de biblioteca conferidas.");
    process.exit(0);
}

void main();
