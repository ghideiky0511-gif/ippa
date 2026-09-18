import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import type { RealtimeInterServerEvents } from "@/contracts/realtime";
import type { RealtimeServer, RealtimeSocketData } from "@/realtime/types";
import { setupPedidosNamespace } from "@/realtime/pedidosNamespace";
import { setupUpdatesNamespace } from "@/realtime/updatesNamespace";

// Custom server: só existe pra pendurar o WebSocket (Socket.IO) no mesmo
// http.Server que atende as rotas Next — `next start` sozinho não expõe
// esse server pra dar `server.on("upgrade", ...)`. Por isso também tiramos
// `output: "standalone"` do next.config.ts (ver comentário lá): standalone
// não traça um server customizado, então rodamos a partir do build normal
// (`next build`) via `tsx`, que entende TypeScript e os aliases `@/*` de
// tsconfig.json sem precisar de um passo de compilação separado.
const port = parseInt(process.env.PORT ?? "3011", 10);
const hostname = process.env.HOSTNAME ?? "0.0.0.0";
const dev = process.env.NODE_ENV !== "production";

// Backend passou a ter origem pública própria (antes só era alcançado via
// rewrite do frontend, então nunca precisou de CORS) — allow-list explícita,
// nunca "*". credentials: false porque a auth da sala vai por ticket
// (handshake.auth/query), não por cookie.
const allowedOrigins = (process.env.REALTIME_ALLOWED_ORIGINS ?? "http://localhost:3015")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
const devLanAccess = process.env.DEV_LAN_ACCESS === "true";

// Teto do desligamento gracioso. Precisa ser MENOR que o `kill_timeout` do
// fly.toml (12s), senão o Fly manda SIGKILL antes de o processo conseguir
// registrar que falhou em drenar.
const SHUTDOWN_TIMEOUT_MS = 8_000;

function isPrivateNetworkHostname(hostname: string): boolean {
    if (hostname === "localhost" || hostname === "::1") return true;
    const octets = hostname.split(".").map(Number);
    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
        return false;
    }
    return octets[0] === 10
        || octets[0] === 127
        || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
        || (octets[0] === 192 && octets[1] === 168);
}

function isAllowedOrigin(origin: string): boolean {
    if (allowedOrigins.includes(origin)) return true;
    if (!devLanAccess) return false;
    try {
        const url = new URL(origin);
        return url.protocol === "http:"
            && url.port === "3015"
            && isPrivateNetworkHostname(url.hostname);
    } catch {
        return false;
    }
}

function allowSocketOrigin(
    origin: string | undefined,
    callback: (error: Error | null, allow?: boolean) => void,
): void {
    callback(null, origin === undefined || isAllowedOrigin(origin));
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
    const httpServer = createServer((req, res) => {
        const origin = req.headers.origin;
        if (origin && isAllowedOrigin(origin)) {
            res.setHeader("Access-Control-Allow-Origin", origin);
            res.setHeader("Access-Control-Allow-Credentials", "true");
            res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
            res.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type");
            res.setHeader("Vary", "Origin");
        }
        if (req.method === "OPTIONS") {
            res.statusCode = 204;
            res.end();
            return;
        }
        handle(req, res);
    });

    // Os quatro generics (ListenEvents, EmitEvents, ServerSideEvents,
    // SocketData) do namespace RAIZ, que aqui não é usado — os dois canais
    // reais são /pedidos e /atualizacoes, cada um com seus próprios tipos
    // (ver src/realtime/types.ts, padrão "Custom types for each namespace"
    // de socket.io/doc/typescript.md). Mapas vazios no raiz fazem qualquer
    // `io.emit(...)` acidental virar erro de compilação em vez de um evento
    // que ninguém escuta.
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
        cors: { origin: allowSocketOrigin, credentials: false },
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

    httpServer.listen(port, hostname, () => {
        console.log(`> Backend pronto em http://${hostname}:${port} (${dev ? "dev" : "production"})`);
    });

    // Fechar só o httpServer NÃO desconecta quem já está em WebSocket — a
    // própria doc avisa ("Only closing the underlying HTTP server is not
    // sufficient...", socket.io/doc/server-api.md). Sem isso, todo deploy do
    // Fly matava as conexões no SIGKILL do fim do kill_timeout, e o motivo de
    // desconexão nativo `server shutting down` nunca era emitido: pro cliente
    // um deploy era indistinguível de uma queda de rede.
    //
    // `io.close()` faz as duas coisas — encerra cada socket com esse motivo e
    // fecha o httpServer subjacente (para de aceitar conexão nova).
    let shuttingDown = false;
    const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`> ${signal} recebido — drenando conexões...`);

        // Rede de segurança: um socket que não fecha (ou uma requisição HTTP
        // pendurada) não pode segurar o processo até o SIGKILL do Fly. Fica
        // abaixo do `kill_timeout` de fly.toml de propósito, pra o log de
        // falha ainda sair antes da Machine ser morta. `unref` pra este timer
        // não ser o que mantém o processo vivo.
        const forceExit = setTimeout(() => {
            console.error(`> Shutdown não terminou em ${SHUTDOWN_TIMEOUT_MS}ms — encerrando à força.`);
            process.exit(1);
        }, SHUTDOWN_TIMEOUT_MS);
        forceExit.unref();

        try {
            const closed = io.close();
            // Conexão keep-alive ociosa não fecha sozinha e seguraria o
            // `httpServer.close()` de dentro do `io.close()`.
            httpServer.closeIdleConnections();
            await closed;
            await app.close();
            console.log("> Conexões encerradas. Até logo.");
            clearTimeout(forceExit);
            process.exit(0);
        } catch (error) {
            console.error("> Falha ao encerrar graciosamente.", error);
            clearTimeout(forceExit);
            process.exit(1);
        }
    };

    // SIGTERM: o que o Fly manda antes de parar/substituir a Machine (deploy,
    // restart, escala). SIGINT: Ctrl+C em desenvolvimento.
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
    process.on("SIGINT", () => void shutdown("SIGINT"));
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
