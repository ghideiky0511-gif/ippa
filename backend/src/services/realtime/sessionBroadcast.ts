import type { Namespace } from "socket.io";
import type { OrderSession } from "@/lib/types";

// Igual ao motivo documentado em lib/sseHub.ts: este módulo é importado tanto
// pelo server.js (processo único, plano) quanto por orderSessionService.ts
// (carregado pelas rotas Next, que em dev pode acabar em instâncias de
// módulo separadas) — globalThis garante uma referência só pro processo
// inteiro, senão o broadcast nunca alcançaria o namespace registrado pelo
// server.js.
const globalForRealtime = globalThis as unknown as {
    __pedidosNamespace?: Namespace;
    __sessionBroadcastTimers?: Map<string, ReturnType<typeof setTimeout>>;
};
const timers = globalForRealtime.__sessionBroadcastTimers ?? (globalForRealtime.__sessionBroadcastTimers = new Map());

const DEBOUNCE_MS = 200;

export function sessionRoom(sessionId: string): string {
    return `session:${sessionId}`;
}

export function registerPedidosNamespace(namespace: Namespace): void {
    globalForRealtime.__pedidosNamespace = namespace;
}

/** Debounce por sessão, mesmo padrão de agendarBroadcastProposta no app de referência — evita um broadcast por campo quando várias mutações chegam em sequência rápida. */
export function scheduleSessionBroadcast(session: OrderSession): void {
    const previous = timers.get(session.id);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(() => {
        timers.delete(session.id);
        const namespace = globalForRealtime.__pedidosNamespace;
        namespace?.to(sessionRoom(session.id)).emit("sessao_atualizada", session);
    }, DEBOUNCE_MS);
    timers.set(session.id, timer);
}
