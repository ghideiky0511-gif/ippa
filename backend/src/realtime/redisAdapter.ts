import { randomBytes } from "node:crypto";
import { createAdapter, type RedisAdapter } from "@socket.io/redis-adapter";
import Redis, { type RedisOptions } from "ioredis";
import { errorMeta, logger } from "@/lib/logger";

// Adapter Redis do Socket.IO: com mais de uma Machine, `io.to(room).emit()`
// só alcança os sockets conectados ao processo que emitiu — o adapter publica
// cada broadcast num canal Redis pra as outras Machines repassarem aos seus
// próprios sockets (documents/knowledge/socket.io/doc/redis-adapter.md).
//
// Sem REDIS_URL (dev local sem Redis) não há adapter e o Socket.IO usa o
// in-memory padrão, que é o correto pra um processo só.
//
// Sticky session NÃO é necessário aqui, apesar do aviso da doc: ele existe
// pro handshake em HTTP long-polling (várias requisições que precisam cair
// no mesmo servidor). Os dois hooks do frontend conectam com
// `transports: ['websocket']` (usePedidoRealtime.ts / useUpdatesRealtime.ts),
// então o handshake é uma requisição só, que já vira a conexão persistente.
// Se alguém tirar esse `transports`, isso deixa de valer.
//
// Conexões PRÓPRIAS, nunca as de lib/redis.ts: aquele client é de cache —
// timeout de 300ms, desiste de reconectar na primeira falha e trata erro como
// "cache miss". O adapter precisa do oposto: conexão persistente que reconecta
// sozinha. E uma conexão em modo subscribe não aceita outros comandos, daí o
// par pub/sub.

// Canais prefixados pelo app: se outro app (staging, por exemplo) apontar pro
// mesmo Redis, os broadcasts de um nunca chegam nos sockets do outro.
// FLY_APP_NAME é definido pelo próprio Fly em toda Machine.
const CHANNEL_PREFIX = `socket.io:${process.env.FLY_APP_NAME ?? "local"}`;

// Tempo que fetchSockets() espera as outras Machines responderem. O padrão
// (5s) seguraria o broadcast de presença tempo demais quando uma Machine morre
// sem se despedir do Redis; depois disso pedidosNamespace.ts cai pros sockets
// locais.
const REQUESTS_TIMEOUT_MS = 2_000;

const LOG_THROTTLE_MS = 30_000;

// Quantas Machines existem no cluster. O adapter perguntaria ao Redis com
// `PUBSUB NUMSUB` no canal de requisições — e no Upstash esse comando só
// enxerga as inscrições do nó onde a PRÓPRIA conexão caiu. Medido em produção
// em 2026-09-18: duas Machines inscritas e recebendo, cada uma via NUMSUB = 1,
// e quem publicava num canal com assinante na outra Machine via 0. O adapter
// concluía que estava sozinho e fetchSockets() devolvia só os sockets locais,
// sem erro e sem log — a presença de /pedidos mostrava só quem estava na
// mesma Machine. PUBLISH atravessa os nós normalmente (medido junto), então a
// contagem vem de um heartbeat no próprio pub/sub: é o mesmo caminho que a
// resposta do fetchSockets vai percorrer.
//
// Custo: um PUBLISH por Machine a cada HEARTBEAT_INTERVAL_MS. Uma Machine que
// morre sem se despedir continua contada por até HEARTBEAT_TTL_MS; nesse
// intervalo o fetchSockets espera a resposta dela até REQUESTS_TIMEOUT_MS e
// pedidosNamespace.ts cai pros sockets locais (com log).
const HEARTBEAT_INTERVAL_MS = 10_000;
const HEARTBEAT_TTL_MS = 25_000;

// Nunca desiste (retorna sempre um número): o adapter é o que conecta as
// Machines, e ficar sem ele é degradar pra entrega só local, não um estado
// aceitável pra sempre.
const retryStrategy = (attempt: number): number => Math.min(attempt * 500, 5_000);

/** Com o Redis fora do ar, cada broadcast falha — um log por falha afogaria o
 * resto. Um a cada 30s, com a contagem do que foi suprimido. */
function throttledErrorLog(message: string): (error: unknown) => void {
    let lastLoggedAt = 0;
    let suppressed = 0;
    return (error) => {
        const now = Date.now();
        if (now - lastLoggedAt < LOG_THROTTLE_MS) {
            suppressed += 1;
            return;
        }
        logger.error("realtime-cluster", message, { ...errorMeta(error), suppressed });
        lastLoggedAt = now;
        suppressed = 0;
    };
}

/** O adapter chama publish/subscribe/unsubscribe SEM await nem catch (é
 * fire-and-forget — ver broadcast() e close() em @socket.io/redis-adapter). No
 * ioredis esses métodos devolvem Promise, e com o Redis fora do ar ela rejeita:
 * sem ninguém tratando, o Node derruba o processo inteiro por unhandled
 * rejection. Anexar o catch aqui transforma isso no comportamento que a doc
 * promete — "pacotes só chegam aos clientes conectados localmente" — em vez de
 * uma queda do backend. A Promise original continua sendo devolvida. */
function catchRejections<T extends (...args: never[]) => Promise<unknown>>(method: T, onError: (error: unknown) => void): T {
    return ((...args: Parameters<T>) => {
        const pending = method(...args);
        pending.catch(onError);
        return pending;
    }) as T;
}

interface PeerTracker {
    /** Total de Machines no cluster, contando esta — a semântica de
     * `serverCount()` do adapter. */
    serverCount(): number;
    close(): void;
}

function createPeerTracker(pubClient: Redis, subClient: Redis, channel: string): PeerTracker {
    // Id por PROCESSO, não por Machine: uma Machine reiniciada é um processo
    // novo que precisa ser anunciado de novo, e com o mesmo id as outras o
    // tomariam por já conhecido e não responderiam.
    const selfId = `${process.env.FLY_MACHINE_ID ?? "local"}-${randomBytes(3).toString("hex")}`;
    const lastSeen = new Map<string, number>();

    const announce = (kind: "alive" | "bye") => {
        void pubClient.publish(channel, `${kind} ${selfId}`);
    };

    const isFresh = (id: string, now = Date.now()) => {
        const seenAt = lastSeen.get(id);
        return seenAt !== undefined && now - seenAt <= HEARTBEAT_TTL_MS;
    };

    subClient.on("message", (from: string, message: string) => {
        if (from !== channel) return;
        const [kind, id] = message.split(" ");
        if (!id || id === selfId) return;
        if (kind === "bye") {
            if (lastSeen.delete(id)) logger.info("realtime-cluster", "Machine saiu do cluster.", { peer: id, machines: serverCount() });
            return;
        }
        const known = isFresh(id);
        lastSeen.set(id, Date.now());
        if (known) return;
        logger.info("realtime-cluster", "Machine entrou no cluster.", { peer: id, machines: serverCount() });
        // Responde na hora: sem isso a Machine recém-chegada passaria até um
        // intervalo inteiro achando que está sozinha.
        announce("alive");
    });
    void subClient.subscribe(channel).then(() => announce("alive"), () => undefined);
    const timer = setInterval(() => announce("alive"), HEARTBEAT_INTERVAL_MS);
    timer.unref();

    function serverCount(): number {
        const now = Date.now();
        for (const id of lastSeen.keys()) {
            if (!isFresh(id, now)) {
                lastSeen.delete(id);
                logger.warn("realtime-cluster", "Machine sumiu do cluster sem se despedir.", { peer: id });
            }
        }
        return lastSeen.size + 1;
    }

    return {
        serverCount,
        close() {
            clearInterval(timer);
            // As outras param de esperar a resposta desta no fetchSockets já
            // agora, em vez de só depois do TTL.
            announce("bye");
        },
    };
}

export interface RealtimeCluster {
    adapter: ReturnType<typeof createAdapter>;
    /** Fecha as duas conexões. Chamar DEPOIS de `io.close()`, que é quem
     * desinscreve o adapter dos canais. */
    close(): void;
}

export function createRealtimeCluster(redisUrl: string | undefined = process.env.REDIS_URL): RealtimeCluster | undefined {
    if (!redisUrl) return undefined;

    const shared: RedisOptions = { retryStrategy };

    // pub: sem fila offline. Com o Redis fora, publicar falha na hora (e o
    // broadcast segue só local) em vez de acumular em memória uma fila que
    // cresce a cada evento e despejaria tudo atrasado quando voltasse.
    const pubClient = new Redis(redisUrl, {
        ...shared,
        enableOfflineQueue: false,
        commandTimeout: REQUESTS_TIMEOUT_MS,
    });
    // sub: COM fila offline e sem limite de tentativas. As inscrições são
    // pedidas uma vez só, na criação do adapter — se o Redis ainda não estiver
    // de pé no boot, elas precisam esperar a conexão em vez de falhar, senão a
    // Machine nunca recebe nada das outras (autoResubscribe só reinscreve o
    // que chegou a ser inscrito).
    const subClient = new Redis(redisUrl, {
        ...shared,
        maxRetriesPerRequest: null,
    });

    // Depois do close() intencional (shutdown), um broadcast que ainda estava
    // a caminho — ex.: participantes_atualizados de um socket que acabou de
    // desconectar, esperando o Postgres — falha com "Connection is closed".
    // Isso é esperado e não pode sair como erro em todo deploy.
    let closing = false;
    const logPubError = throttledErrorLog("Redis do adapter indisponível (pub) — broadcasts ficam só nesta Machine.");
    const logSubError = throttledErrorLog("Redis do adapter indisponível (sub) — esta Machine não recebe broadcasts das outras.");
    const onPubError = (error: unknown) => { if (!closing) logPubError(error); };
    const onSubError = (error: unknown) => { if (!closing) logSubError(error); };
    pubClient.on("error", onPubError);
    subClient.on("error", onSubError);
    pubClient.on("ready", () => logger.info("realtime-cluster", "Adapter Redis conectado (pub)."));
    subClient.on("ready", () => logger.info("realtime-cluster", "Adapter Redis conectado (sub)."));

    pubClient.publish = catchRejections(pubClient.publish.bind(pubClient), onPubError) as typeof pubClient.publish;
    subClient.subscribe = catchRejections(subClient.subscribe.bind(subClient), onSubError) as typeof subClient.subscribe;
    subClient.psubscribe = catchRejections(subClient.psubscribe.bind(subClient), onSubError) as typeof subClient.psubscribe;
    subClient.unsubscribe = catchRejections(subClient.unsubscribe.bind(subClient), onSubError) as typeof subClient.unsubscribe;
    subClient.punsubscribe = catchRejections(subClient.punsubscribe.bind(subClient), onSubError) as typeof subClient.punsubscribe;

    const peers = createPeerTracker(pubClient, subClient, `${CHANNEL_PREFIX}-machines`);
    const baseAdapter = createAdapter(pubClient, subClient, {
        key: CHANNEL_PREFIX,
        requestsTimeout: REQUESTS_TIMEOUT_MS,
    });
    // `function`, não arrow: o Socket.IO instancia o adapter com `new`.
    const adapter = function (nsp: unknown): RedisAdapter {
        const instance = baseAdapter(nsp);
        instance.serverCount = async () => peers.serverCount();
        return instance;
    };

    return {
        adapter,
        close() {
            // Antes de desligar o pub: o "bye" ainda precisa sair.
            peers.close();
            closing = true;
            // disconnect(), não quit(): quit() entra na fila offline do sub e,
            // com o Redis fora, esperaria para sempre — segurando o shutdown
            // até o SIGKILL do Fly.
            pubClient.disconnect();
            subClient.disconnect();
        },
    };
}
