import type { OrderSession } from "@/lib/types";
import type { PedidosNamespace } from "@/realtime/types";

// Este módulo é importado tanto
// pelo server.js (processo único, plano) quanto por orderSessionService.ts
// (carregado pelas rotas Next, que em dev pode acabar em instâncias de
// módulo separadas) — globalThis garante uma referência só pro processo
// inteiro, senão o broadcast nunca alcançaria o namespace registrado pelo
// server.js.
const globalForRealtime = globalThis as unknown as {
    __pedidosNamespace?: PedidosNamespace;
    __sessionBroadcastTimers?: Map<string, ReturnType<typeof setTimeout>>;
};
const timers = globalForRealtime.__sessionBroadcastTimers ?? (globalForRealtime.__sessionBroadcastTimers = new Map());
// Os timers ficam por processo DE PROPÓSITO, mesmo com várias Machines: cada
// mutação é processada numa Machine só, o debounce acontece ali, e o emit final
// atravessa o adapter Redis como qualquer broadcast. Se cliente e vendedora
// mexerem no mesmo pedido a partir de Machines diferentes, saem dois
// `sessao_atualizada` em vez de um — inofensivo: é sempre o snapshot completo,
// e os dois consumidores (ClientSessionProvider/TalaoProvider no frontend)
// descartam o que tiver `updatedAt` mais velho que o que já têm. Coordenar o
// debounce entre Machines custaria uma ida ao Redis por mutação pra economizar
// um evento redundante.

const DEBOUNCE_MS = 200;

export function sessionRoom(sessionId: string): string {
    return `session:${sessionId}`;
}

export function registerPedidosNamespace(namespace: PedidosNamespace): void {
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
