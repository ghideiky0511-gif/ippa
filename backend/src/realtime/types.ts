// Generics de TypeScript do Socket.IO no lado servidor, no padrão "Custom
// types for each namespace" da doc oficial (ver
// documents/knowledge/socket.io/doc/typescript.md): cada namespace tem seu
// próprio conjunto de eventos, então cada um recebe seus quatro generics
// (ListenEvents, EmitEvents, ServerSideEvents, SocketData) em vez de todos
// herdarem os do `Server`.
//
// Os mapas de evento vêm de @/contracts/realtime — fonte única compartilhada
// com o frontend por scripts/sync-contracts.mjs, pra que servidor e cliente
// nunca discordem sobre nome de evento ou formato de payload.
import type { Namespace, Server, Socket } from "socket.io";
import type {
    AtualizacoesClientToServerEvents,
    AtualizacoesServerToClientEvents,
    PedidosClientToServerEvents,
    PedidosServerToClientEvents,
    RealtimeInterServerEvents,
} from "@/contracts/realtime";
import type { OrderSession } from "@/contracts/orders";
import type { AuthUser } from "@/lib/types";
import type { Tenant } from "@/lib/db/tenant";

/** O que TODO socket autenticado carrega, em qualquer namespace: é o que o
 * ticket consumido entrega (ticketService.ts). Serve também de SocketData do
 * namespace raiz — como todo campo específico de namespace é opcional, os
 * tipos derivados continuam atribuíveis a partir deste, que é o que faz o
 * `io.of(...)` tipado do padrão "Custom types for each namespace" compilar. */
export interface RealtimeSocketData {
    tenant: Tenant;
    user: AuthUser;
}

/** `socket.data` do namespace /pedidos — preenchido pelo middleware de
 * ticket, antes de qualquer handler rodar. */
export interface PedidosSocketData extends RealtimeSocketData {
    /** Ausente no socket que nasce sem sessão (fluxo da cliente, que só ganha
     * uma sessão depois de `criar_sessao_cliente`). */
    sessionId?: string;
    initialSnapshot?: OrderSession;
    canCreateCustomerSession?: boolean;
}

/** `socket.data` do namespace /atualizacoes — o ticket consumido inteiro,
 * sem nada além disso (membership de room é derivada do papel no join). */
export type UpdatesSocketData = RealtimeSocketData;

// O namespace raiz ("/") não recebe sockets: os dois canais reais são
// /pedidos e /atualizacoes, e um socket que ficasse no raiz nunca passaria por
// um middleware de ticket. Por isso os mapas cliente↔servidor do Server são
// vazios — qualquer `io.emit(...)` acidental no raiz vira erro de compilação em
// vez de um evento que ninguém recebe. O que o raiz carrega é o canal entre
// Machines (`io.serverSideEmit`/`io.on`, RealtimeInterServerEvents), que passa
// pelo adapter Redis.
export type RealtimeServer = Server<
    Record<string, never>,
    Record<string, never>,
    RealtimeInterServerEvents,
    RealtimeSocketData
>;

export type PedidosNamespace = Namespace<
    PedidosClientToServerEvents,
    PedidosServerToClientEvents,
    RealtimeInterServerEvents,
    PedidosSocketData
>;

export type PedidosSocket = Socket<
    PedidosClientToServerEvents,
    PedidosServerToClientEvents,
    RealtimeInterServerEvents,
    PedidosSocketData
>;

export type UpdatesNamespace = Namespace<
    AtualizacoesClientToServerEvents,
    AtualizacoesServerToClientEvents,
    RealtimeInterServerEvents,
    UpdatesSocketData
>;
