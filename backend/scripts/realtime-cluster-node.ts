/**
 * Um nó do teste de cluster (scripts/testar-realtime-cluster.ts) — o
 * equivalente a UMA Machine. Sobe o Socket.IO pelo mesmo setupRealtime() que o
 * server.ts usa em produção (adapter, namespaces, aviso de tenant, shutdown),
 * só sem o Next na frente, e obedece comandos do harness por IPC.
 *
 * Não é pra rodar sozinho: o harness faz o fork com REDIS_URL/DATABASE_URL
 * locais já definidos.
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { findActiveTenant, forgetTenant } from "@/lib/db/tenant";
import { rateLimit } from "@/lib/http/apiHelpers";
import { setupRealtime } from "@/realtime/setupRealtime";
import { notifyUserNotification } from "@/services/realtime/updateBroadcast";

export type NodeCommand =
    | { id: number; cmd: "warmTenant"; slug: string }
    | { id: number; cmd: "tenantCached"; slug: string }
    | { id: number; cmd: "forgetTenant"; slug: string }
    | {
          id: number;
          cmd: "rateLimit";
          scope: string;
          identifier: string;
          limit: number;
          windowMs: number;
      }
    | { id: number; cmd: "notifyUser"; tenantId: string; userId: string }
    | { id: number; cmd: "shutdown" };

export type NodeMessage =
    | { type: "ready"; port: number; adapter: "redis" | "memory" }
    | { type: "reply"; id: number; result: unknown }
    | { type: "fatal"; error: string };

function send(message: NodeMessage): void {
    process.send?.(message);
}

// Em produção uma rejeição sem tratamento derruba o processo (padrão do Node).
// Aqui ela vira uma mensagem pro harness antes da queda, pra o teste falhar
// dizendo o porquê — é exatamente o que o catch em redisAdapter.ts evita.
process.on("unhandledRejection", (error) => {
    send({
        type: "fatal",
        error: `unhandledRejection: ${error instanceof Error ? error.stack : String(error)}`,
    });
    setTimeout(() => process.exit(99), 50);
});

const httpServer = createServer();
const realtime = setupRealtime(httpServer, { cors: { origin: true } });

// Espia o cache de tenant pelo mesmo globalThis que lib/db/tenant.ts usa.
function tenantCached(slug: string): boolean {
    const cache = (
        globalThis as unknown as {
            __tenantCache?: Map<string, { expiresAt: number }>;
        }
    ).__tenantCache;
    const entry = cache?.get(slug);
    return Boolean(entry && entry.expiresAt > Date.now());
}

async function run(command: NodeCommand): Promise<unknown> {
    switch (command.cmd) {
        case "warmTenant":
            return Boolean(await findActiveTenant(command.slug));
        case "tenantCached":
            return tenantCached(command.slug);
        case "forgetTenant":
            forgetTenant(command.slug);
            return true;
        case "rateLimit":
            return rateLimit(
                command.scope,
                command.identifier,
                command.limit,
                command.windowMs,
            );
        case "notifyUser":
            notifyUserNotification(command.tenantId, command.userId);
            return true;
        case "shutdown":
            await realtime.close();
            return true;
    }
}

process.on("message", (raw) => {
    const command = raw as NodeCommand;
    run(command)
        .then((result) => {
            send({ type: "reply", id: command.id, result });
            if (command.cmd === "shutdown")
                setTimeout(() => process.exit(0), 50);
        })
        .catch((error: unknown) =>
            send({
                type: "fatal",
                error:
                    error instanceof Error
                        ? (error.stack ?? error.message)
                        : String(error),
            }),
        );
});

httpServer.listen(0, "127.0.0.1", () => {
    send({
        type: "ready",
        port: (httpServer.address() as AddressInfo).port,
        adapter: realtime.adapter,
    });
});
