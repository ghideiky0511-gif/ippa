import { createServer } from "node:http";
import next from "next";
import { setupRealtime } from "@/realtime/setupRealtime";

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

    // Montagem do Socket.IO (adapter, namespaces, generics, otimização de
    // memória): src/realtime/setupRealtime.ts.
    const realtime = setupRealtime(httpServer, {
        cors: { origin: allowSocketOrigin, credentials: false },
    });
    console.log(realtime.adapter === "redis"
        ? "> Socket.IO com adapter Redis (broadcast entre Machines)."
        : "> Socket.IO com adapter em memória (sem REDIS_URL: um processo só).");

    httpServer.listen(port, hostname, () => {
        console.log(`> Backend pronto em http://${hostname}:${port} (${dev ? "dev" : "production"})`);
    });

    // Sem shutdown explícito, todo deploy do Fly matava as conexões no SIGKILL
    // do fim do kill_timeout, e o motivo de desconexão nativo `server shutting
    // down` nunca era emitido: pro cliente um deploy era indistinguível de uma
    // queda de rede. `realtime.close()` (io.close() por baixo, ver
    // setupRealtime.ts) encerra cada socket com esse motivo e fecha o
    // httpServer subjacente (para de aceitar conexão nova).
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
            const closed = realtime.close();
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
