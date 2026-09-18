/**
 * Teste de cluster do realtime: sobe DUAS instâncias do Socket.IO (dois
 * processos, cada um o equivalente a uma Machine do Fly) contra o mesmo Redis
 * e o mesmo Postgres, e confere o que precisa valer com mais de uma Machine:
 *
 *  - ticket minerado por um processo e consumido por outro (Postgres, não Map);
 *  - broadcast emitido numa instância chegando a sockets da outra (adapter);
 *  - presença do pedido com gente das duas instâncias (fetchSockets);
 *  - regras de ticket: uso único, tipo certo por namespace;
 *  - invalidação do cache de tenant avisando a outra instância;
 *  - rate limit contado junto pelas duas;
 *  - uma instância desligando sem derrubar a outra;
 *  - uma terceira instância com o Redis FORA DO AR: não cai, entrega local.
 *
 * Só roda contra Redis e Postgres LOCAIS (recusa qualquer outro host): muda o
 * campo `notes` de um pedido aberto e devolve o valor original no fim.
 *
 *   docker run -d --rm --name ippa-redis-cluster-test -p 127.0.0.1:6390:6379 redis:7-alpine
 *   DATABASE_URL=postgresql://ippa_app:...@localhost:5433/ippa npm run test:realtime-cluster
 *
 * Opcionais: REALTIME_TEST_REDIS_URL (padrão redis://127.0.0.1:6390) e
 * REALTIME_TEST_SESSION (id do pedido; padrão: o aberto mais recente com
 * cliente cadastrada).
 */
import assert from "node:assert/strict";
import { fork, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import type { PedidoPresence, RealtimeEvent } from "@/contracts/realtime";
import { getPool } from "@/lib/db/pool";
import { withTenantTransaction, type Tenant } from "@/lib/db/tenant";
import type { AuthUser, OrderSession } from "@/lib/types";
import { findOrderSessionRow } from "@/models/ordersModel";
import {
    findUserRowByClientId,
    findUserRowById,
    type UserRow,
} from "@/models/usersModel";
import {
    mintRealtimeTicket,
    mintUpdatesRealtimeTicket,
} from "@/services/realtime/ticketService";
import type { NodeCommand, NodeMessage } from "./realtime-cluster-node";

const EVENT_TIMEOUT_MS = 5_000;
const DEAD_REDIS_URL = "redis://127.0.0.1:6399";

// --- socket.io-client -------------------------------------------------------
// Dependência do FRONTEND (o backend nunca conecta como cliente em produção);
// carregada do workspace vizinho, como em testar-realtime-shutdown.ts.
interface ProbeClient {
    on(event: string, listener: (...args: unknown[]) => void): void;
    off(event: string, listener: (...args: unknown[]) => void): void;
    emitWithAck(event: string, ...args: unknown[]): Promise<unknown>;
    close(): void;
}
const requireFrom = createRequire(__filename);
const { io: connect } = requireFrom(
    "../../frontend/node_modules/socket.io-client/build/cjs/index.js",
) as { io: (url: string, options: Record<string, unknown>) => ProbeClient };

function open(url: string, tenantSlug: string, ticket: string): ProbeClient {
    // forceNew: sem isso o client reaproveita a mesma conexão pra sockets do
    // mesmo host, e cada socket aqui representa uma pessoa diferente.
    return connect(url, {
        auth: { tenantSlug, ticket },
        transports: ["websocket"],
        reconnection: false,
        forceNew: true,
    });
}

function waitFor<T>(
    client: ProbeClient,
    event: string,
    label: string,
    predicate: (payload: T) => boolean = () => true,
): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            client.off(event, listener);
            reject(new Error(`timeout esperando "${event}": ${label}`));
        }, EVENT_TIMEOUT_MS);
        const listener = (...args: unknown[]) => {
            const payload = args[0] as T;
            if (!predicate(payload)) return;
            clearTimeout(timer);
            client.off(event, listener);
            resolve(payload);
        };
        client.on(event, listener);
    });
}

async function connected(client: ProbeClient, label: string): Promise<void> {
    const outcome = await Promise.race([
        waitFor<void>(client, "connect", label).then(() => "ok" as const),
        waitFor<Error>(client, "connect_error", label).then((error) => error),
    ]);
    if (outcome !== "ok")
        throw new Error(`${label}: recusado (${outcome.message})`);
}

async function refused(client: ProbeClient, label: string): Promise<string> {
    const outcome = await Promise.race([
        waitFor<void>(client, "connect", label).then(() => null),
        waitFor<Error>(client, "connect_error", label).then(
            (error) => error.message,
        ),
    ]);
    client.close();
    if (outcome === null)
        throw new Error(`${label}: deveria ter sido recusado e conectou`);
    return outcome;
}

// --- nós (um processo = uma Machine) ------------------------------------------
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
    ? Omit<T, K>
    : never;

class ClusterNode {
    port = 0;
    adapter = "";
    fatal: string | null = null;
    private nextId = 1;
    private readonly pending = new Map<
        number,
        { resolve: (value: unknown) => void; reject: (error: Error) => void }
    >();
    readonly exited: Promise<number | null>;

    private constructor(
        readonly name: string,
        private readonly child: ChildProcess,
    ) {
        this.exited = new Promise((resolve) =>
            child.on("exit", (code) => resolve(code)),
        );
        const prefix = (line: string) =>
            line && console.log(`   [${name}] ${line}`);
        child.stdout?.on("data", (chunk: Buffer) =>
            chunk.toString().split(/\r?\n/).forEach(prefix),
        );
        child.stderr?.on("data", (chunk: Buffer) =>
            chunk.toString().split(/\r?\n/).forEach(prefix),
        );
        child.on("message", (raw) => {
            const message = raw as NodeMessage;
            if (message.type === "reply") {
                this.pending.get(message.id)?.resolve(message.result);
                this.pending.delete(message.id);
            } else if (message.type === "fatal") {
                this.fatal = message.error;
                for (const { reject } of this.pending.values())
                    reject(new Error(`[${name}] ${message.error}`));
                this.pending.clear();
            }
        });
    }

    static start(name: string, redisUrl: string): Promise<ClusterNode> {
        const child = fork(
            path.join(__dirname, "realtime-cluster-node.ts"),
            [],
            {
                cwd: path.join(__dirname, ".."),
                execArgv: ["--import", "tsx"],
                env: {
                    ...process.env,
                    REDIS_URL: redisUrl,
                    FLY_APP_NAME: "cluster-test",
                },
                stdio: ["ignore", "pipe", "pipe", "ipc"],
            },
        );
        const node = new ClusterNode(name, child);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error(`[${name}] não subiu em 30s`)),
                30_000,
            );
            child.on("message", (raw) => {
                const message = raw as NodeMessage;
                if (message.type !== "ready") return;
                clearTimeout(timer);
                node.port = message.port;
                node.adapter = message.adapter;
                resolve(node);
            });
            child.on("exit", (code) =>
                reject(
                    new Error(`[${name}] saiu antes de subir (código ${code})`),
                ),
            );
        });
    }

    url(namespace: "/pedidos" | "/atualizacoes"): string {
        return `http://127.0.0.1:${this.port}${namespace}`;
    }

    call<T>(command: DistributiveOmit<NodeCommand, "id">): Promise<T> {
        if (this.fatal)
            return Promise.reject(new Error(`[${this.name}] ${this.fatal}`));
        const id = this.nextId++;
        return new Promise<T>((resolve, reject) => {
            this.pending.set(id, {
                resolve: (value) => resolve(value as T),
                reject,
            });
            this.child.send({ ...command, id });
        });
    }

    kill(): void {
        if (this.child.exitCode === null) this.child.kill();
    }
}

// --- fixture ------------------------------------------------------------------
interface Fixture {
    tenant: Tenant;
    sessionId: string;
    originalNotes: string | null;
    seller: AuthUser;
    customer: AuthUser;
}

function toAuthUser(row: UserRow): AuthUser {
    return {
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        clientId: row.client_id ?? undefined,
        permissions: row.permissions,
    };
}

function assertLocal(name: string, value: string): void {
    const host = value ? new URL(value).hostname : "";
    if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) {
        throw new Error(
            `${name} precisa apontar pra localhost (veio "${host || "vazio"}") — este teste escreve dados.`,
        );
    }
}

async function loadFixture(): Promise<Fixture> {
    const tenants = (
        await getPool().query<Tenant>(
            "SELECT id, slug, name FROM tenants WHERE active = true AND status = 'active' ORDER BY slug",
        )
    ).rows;
    const wanted = process.env.REALTIME_TEST_SESSION;
    for (const tenant of tenants) {
        const found = await withTenantTransaction(
            tenant,
            {},
            async (client) => {
                const sessionId =
                    wanted ??
                    (
                        await client.query<{ id: string }>(
                            `SELECT s.id FROM order_sessions s
                 WHERE s.tenant_id = app_tenant_id() AND s.status = 'aberto' AND s.client_id IS NOT NULL
                   AND EXISTS (SELECT 1 FROM users u WHERE u.tenant_id = s.tenant_id AND u.client_id = s.client_id
                               AND u.role = 'cliente' AND u.deleted_at IS NULL)
                 ORDER BY s.updated_at DESC LIMIT 1`,
                        )
                    ).rows[0]?.id;
                if (!sessionId) return null;
                const session = await findOrderSessionRow(client, sessionId);
                if (!session?.client_id) return null;
                const seller = await findUserRowById(client, session.seller_id);
                const customer = await findUserRowByClientId(
                    client,
                    session.client_id,
                );
                if (!seller || !customer) return null;
                return {
                    sessionId,
                    originalNotes: session.notes,
                    seller: toAuthUser(seller),
                    customer: toAuthUser(customer),
                };
            },
        );
        if (found) return { tenant, ...found };
    }
    throw new Error(
        "Nenhum pedido aberto com cliente cadastrada no banco local (ou REALTIME_TEST_SESSION não encontrado).",
    );
}

// --- roteiro --------------------------------------------------------------------
let stepNumber = 0;
async function step(label: string, run: () => Promise<void>): Promise<void> {
    stepNumber += 1;
    await run();
    console.log(`${String(stepNumber).padStart(2)} ok — ${label}`);
}

const isPresence = (people: PedidoPresence[], ...userIds: string[]) =>
    people.length === userIds.length &&
    userIds.every((id) => people.some((person) => person.userId === id));

async function main(): Promise<void> {
    const redisUrl =
        process.env.REALTIME_TEST_REDIS_URL ?? "redis://127.0.0.1:6390";
    assertLocal("REALTIME_TEST_REDIS_URL", redisUrl);
    assertLocal("DATABASE_URL", process.env.DATABASE_URL ?? "");

    const fx = await loadFixture();
    const { tenant, sessionId, seller, customer } = fx;
    console.log(
        `Pedido ${sessionId} (${tenant.slug}) — vendedora ${seller.role}, cliente ${customer.role}\n`,
    );

    const nodes: ClusterNode[] = [];
    const clients: ProbeClient[] = [];
    const track = (client: ProbeClient) => (clients.push(client), client);

    try {
        const [a, b] = await Promise.all([
            ClusterNode.start("A", redisUrl),
            ClusterNode.start("B", redisUrl),
        ]);
        nodes.push(a, b);
        assert.equal(a.adapter, "redis");
        assert.equal(b.adapter, "redis");

        // Tickets minerados AQUI, num terceiro processo: se ainda morassem num
        // Map em memória, nenhuma das duas instâncias conheceria o token.
        const [
            sellerPedTicket,
            customerPedTicket,
            sellerUpdTicket,
            customerUpdTicket,
        ] = await Promise.all([
            mintRealtimeTicket(tenant, seller, sessionId),
            mintRealtimeTicket(tenant, customer, sessionId),
            mintUpdatesRealtimeTicket(tenant, seller),
            mintUpdatesRealtimeTicket(tenant, customer),
        ]);

        const sellerPed = track(
            open(a.url("/pedidos"), tenant.slug, sellerPedTicket.token),
        );
        const customerPed = track(
            open(b.url("/pedidos"), tenant.slug, customerPedTicket.token),
        );
        const sellerUpd = track(
            open(b.url("/atualizacoes"), tenant.slug, sellerUpdTicket.token),
        );
        const customerUpd = track(
            open(a.url("/atualizacoes"), tenant.slug, customerUpdTicket.token),
        );

        await step(
            "tickets minerados por outro processo aceitos nas duas instâncias (Postgres, não Map)",
            async () => {
                await Promise.all([
                    connected(sellerPed, "vendedora /pedidos em A"),
                    connected(customerPed, "cliente /pedidos em B"),
                    connected(sellerUpd, "vendedora /atualizacoes em B"),
                    connected(customerUpd, "cliente /atualizacoes em A"),
                ]);
            },
        );

        await step(
            "reusar um ticket é recusado (uso único vale entre instâncias)",
            async () => {
                const message = await refused(
                    open(
                        a.url("/atualizacoes"),
                        tenant.slug,
                        sellerUpdTicket.token,
                    ),
                    "ticket reutilizado",
                );
                assert.match(message, /Ticket inválido/);
            },
        );

        await step(
            "ticket de sessão é recusado em /atualizacoes (tipo errado)",
            async () => {
                const wrongKind = await mintRealtimeTicket(
                    tenant,
                    seller,
                    sessionId,
                );
                const message = await refused(
                    open(b.url("/atualizacoes"), tenant.slug, wrongKind.token),
                    "ticket de sessão em /atualizacoes",
                );
                assert.match(message, /Ticket inválido/);
            },
        );

        await step(
            "ticket sem pedido é aceito em /pedidos (fluxo da cliente sem pedido)",
            async () => {
                const noSession = await mintUpdatesRealtimeTicket(
                    tenant,
                    customer,
                );
                const socket = open(
                    a.url("/pedidos"),
                    tenant.slug,
                    noSession.token,
                );
                await connected(socket, "cliente sem pedido em /pedidos");
                socket.close();
            },
        );

        let customerSnapshot: OrderSession | undefined;
        await step(
            "presença do pedido junta gente das duas instâncias (fetchSockets via Redis)",
            async () => {
                const sellerSnapshot = waitFor<OrderSession>(
                    sellerPed,
                    "sessao_snapshot",
                    "snapshot da vendedora",
                );
                assert.deepEqual(
                    await sellerPed.emitWithAck("entrar_sessao", {}),
                    { ok: true },
                );
                await sellerSnapshot;

                // A vendedora está em A; a cliente entra por B. O roster que chega
                // na vendedora precisa ter as duas.
                const rosterOnA = waitFor<PedidoPresence[]>(
                    sellerPed,
                    "presenca_atualizada",
                    "roster com as duas, visto de A",
                    (people) => isPresence(people, seller.id, customer.id),
                );
                const snapshotOnB = waitFor<OrderSession>(
                    customerPed,
                    "sessao_snapshot",
                    "snapshot da cliente",
                );
                assert.deepEqual(
                    await customerPed.emitWithAck("entrar_sessao", {}),
                    { ok: true },
                );
                customerSnapshot = await snapshotOnB;
                await rosterOnA;
            },
        );

        const newNotes = `teste de cluster ${new Date().toISOString()}`;
        await step(
            "mutação em A chega em B: sessao_atualizada (/pedidos) e session_patch (/atualizacoes)",
            async () => {
                const initialUpdatedAt = customerSnapshot!.updatedAt;
                const sessionOnB = waitFor<OrderSession>(
                    customerPed,
                    "sessao_atualizada",
                    "pedido atualizado na cliente (B)",
                    (session) =>
                        session.id === sessionId &&
                        session.updatedAt > initialUpdatedAt,
                );
                const patchForSellerOnB = waitFor<RealtimeEvent>(
                    sellerUpd,
                    "atualizacao_v2",
                    "session_patch da vendedora (B)",
                    (event) =>
                        event.t === "session_patch" &&
                        event.sid === sessionId &&
                        event.patch.notes === newNotes,
                );
                const patchForCustomerOnA = waitFor<RealtimeEvent>(
                    customerUpd,
                    "atualizacao_v2",
                    "session_patch da cliente (A)",
                    (event) =>
                        event.t === "session_patch" && event.sid === sessionId,
                );

                assert.deepEqual(
                    await sellerPed.emitWithAck("atualizar_sessao", {
                        notes: newNotes,
                    }),
                    { ok: true },
                );
                await sessionOnB;
                await patchForSellerOnB;
                const customerPatch = await patchForCustomerOnA;
                assert.ok(
                    customerPatch.t === "session_patch" &&
                        !("notes" in customerPatch.patch),
                    "a cliente não pode receber `notes` no session_patch",
                );
            },
        );

        await step("cliente saindo de B atualiza o roster em A", async () => {
            const rosterOnA = waitFor<PedidoPresence[]>(
                sellerPed,
                "presenca_atualizada",
                "roster só com a vendedora",
                (people) => isPresence(people, seller.id),
            );
            customerPed.close();
            await rosterOnA;
        });

        await step(
            "invalidar tenant em A limpa o cache de B (serverSideEmit)",
            async () => {
                assert.equal(
                    await b.call<boolean>({
                        cmd: "warmTenant",
                        slug: tenant.slug,
                    }),
                    true,
                );
                assert.equal(
                    await b.call<boolean>({
                        cmd: "tenantCached",
                        slug: tenant.slug,
                    }),
                    true,
                );
                await a.call({ cmd: "forgetTenant", slug: tenant.slug });
                const deadline = Date.now() + EVENT_TIMEOUT_MS;
                while (
                    await b.call<boolean>({
                        cmd: "tenantCached",
                        slug: tenant.slug,
                    })
                ) {
                    if (Date.now() > deadline)
                        throw new Error("B continuou com o tenant em cache");
                    await new Promise((done) => setTimeout(done, 50));
                }
            },
        );

        await step(
            "rate limit contado junto pelas duas instâncias (Redis)",
            async () => {
                const limit = {
                    scope: `cluster-test-${Date.now()}`,
                    identifier: "mesma-pessoa",
                    limit: 4,
                    windowMs: 10_000,
                };
                const results: boolean[] = [];
                for (const node of [a, b, a, b, a, b]) {
                    results.push(
                        (
                            await node.call<{ allowed: boolean }>({
                                cmd: "rateLimit",
                                ...limit,
                            })
                        ).allowed,
                    );
                }
                assert.deepEqual(results, [
                    true,
                    true,
                    true,
                    true,
                    false,
                    false,
                ]);
            },
        );

        await step(
            "A desligando: seus sockets caem, o processo sai limpo e B segue entregando",
            async () => {
                const sellerDropped = waitFor(
                    sellerPed,
                    "disconnect",
                    "vendedora em A desconectada",
                );
                const customerDropped = waitFor(
                    customerUpd,
                    "disconnect",
                    "cliente em A desconectada",
                );
                await a.call({ cmd: "shutdown" });
                await Promise.all([sellerDropped, customerDropped]);
                const code = await Promise.race([
                    a.exited,
                    new Promise((done) =>
                        setTimeout(() => done("timeout"), EVENT_TIMEOUT_MS),
                    ),
                ]);
                assert.equal(
                    code,
                    0,
                    `A deveria sair com código 0, saiu com ${String(code)}`,
                );

                const signal = waitFor<{ type: string }>(
                    sellerUpd,
                    "atualizacao",
                    "sinal entregue por B depois de A sair",
                    (payload) => payload.type === "notifications_updated",
                );
                await b.call({
                    cmd: "notifyUser",
                    tenantId: tenant.id,
                    userId: seller.id,
                });
                await signal;
            },
        );

        await step(
            "Redis fora do ar: instância não cai, entrega local e presença local continuam",
            async () => {
                const c = await ClusterNode.start("C", DEAD_REDIS_URL);
                nodes.push(c);
                assert.equal(c.adapter, "redis");

                const updTicket = await mintUpdatesRealtimeTicket(
                    tenant,
                    seller,
                );
                const pedTicket = await mintRealtimeTicket(
                    tenant,
                    seller,
                    sessionId,
                );
                const updOnC = track(
                    open(c.url("/atualizacoes"), tenant.slug, updTicket.token),
                );
                const pedOnC = track(
                    open(c.url("/pedidos"), tenant.slug, pedTicket.token),
                );
                await Promise.all([
                    connected(updOnC, "/atualizacoes em C"),
                    connected(pedOnC, "/pedidos em C"),
                ]);

                const localRoster = waitFor<PedidoPresence[]>(
                    pedOnC,
                    "presenca_atualizada",
                    "roster local em C",
                    (people) => isPresence(people, seller.id),
                );
                assert.deepEqual(
                    await pedOnC.emitWithAck("entrar_sessao", {}),
                    { ok: true },
                );
                await localRoster;

                const signal = waitFor<{ type: string }>(
                    updOnC,
                    "atualizacao",
                    "sinal entregue localmente em C",
                    (payload) => payload.type === "notifications_updated",
                );
                await c.call({
                    cmd: "notifyUser",
                    tenantId: tenant.id,
                    userId: seller.id,
                });
                await signal;

                // Tempo pra qualquer publish rejeitado virar unhandled rejection.
                await new Promise((done) => setTimeout(done, 1_500));
                assert.equal(c.fatal, null, `C caiu: ${c.fatal}`);

                await c.call({ cmd: "shutdown" });
                const code = await Promise.race([
                    c.exited,
                    new Promise((done) =>
                        setTimeout(() => done("timeout"), EVENT_TIMEOUT_MS),
                    ),
                ]);
                assert.equal(
                    code,
                    0,
                    `C deveria sair com código 0 mesmo sem Redis, saiu com ${String(code)}`,
                );
            },
        );

        await b.call({ cmd: "shutdown" });
        await b.exited;
        console.log("\nTodas as verificações de cluster passaram.");
    } finally {
        for (const client of clients) client.close();
        for (const node of nodes) node.kill();
        await withTenantTransaction(tenant, seller, (client) =>
            client.query("UPDATE order_sessions SET notes = $1 WHERE id = $2", [
                fx.originalNotes,
                sessionId,
            ]),
        ).catch((error: unknown) =>
            console.error("Falha ao restaurar `notes` do pedido:", error),
        );
        await getPool().end();
    }
}

main().then(
    () => process.exit(0),
    (error: unknown) => {
        console.error(
            "\nFALHOU:",
            error instanceof Error ? error.message : error,
        );
        process.exit(1);
    },
);
