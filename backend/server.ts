import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
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
const allowedOrigins = (process.env.REALTIME_ALLOWED_ORIGINS ?? "http://localhost:3010")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
    const httpServer = createServer((req, res) => {
        const origin = req.headers.origin;
        if (origin && allowedOrigins.includes(origin)) {
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

    const io = new Server(httpServer, {
        cors: { origin: allowedOrigins, credentials: false },
    });
    setupPedidosNamespace(io);
    setupUpdatesNamespace(io);

    httpServer.listen(port, hostname, () => {
        console.log(`> Backend pronto em http://${hostname}:${port} (${dev ? "dev" : "production"})`);
    });
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
