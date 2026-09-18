import { z } from 'zod';
import { CartItemSchema, EntityIdSchema, IsoDateTimeSchema } from './shared';
import type { CartItem } from './shared';
import { OrderBookSchema, OrderSessionSchema } from './orders';
import type { OrderSession, OrderSessionParticipant } from './orders';
import type { UserRole } from './auth';

// Patch de sessão sem os itens (ver 'session_items' abaixo para o caso
// quente de peça adicionada/removida/qty alterada). Todo campo PRESENTE
// substitui o valor local; campo ausente fica como estava — ao contrário de
// OrderSessionSchema completo (onde ausência pode significar "nunca teve"),
// aqui ausência sempre significa "sem mudança nesta rodada". Por isso o
// merge no cliente é sempre um spread raso por cima do estado local, nunca
// uma substituição.
export const SessionPatchSchema = OrderSessionSchema.omit({ id: true, items: true }).partial();
export type SessionPatch = z.infer<typeof SessionPatchSchema>;

// Evento incremental do namespace /atualizacoes (canal 'atualizacao_v2') —
// substitui o refetch completo de /api/sessions + /api/order-books por
// aplicação local. Ver backend/src/services/realtime/updateBroadcast.ts.
export const RealtimeEventSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('session_items'),
    sid: EntityIdSchema,
    // updated_at da sessão ANTES desta mutação — a cadeia causal: se não
    // bater com o updatedAt que o cliente tem localmente, houve um evento
    // perdido no meio e ele deve re-sincronizar só essa sessão (GET
    // /api/sessions/:id), não o talão inteiro.
    prev: IsoDateTimeSchema,
    at: IsoDateTimeSchema,
    // qty ABSOLUTA (não incremento) — aplicar por cima de uma atualização
    // otimista local converge pro mesmo resultado, inclusive pro autor da
    // própria mutação (que recebe o eco sem efeito colateral).
    set: z.array(CartItemSchema),
    del: z.array(EntityIdSchema),
  }),
  z.object({
    t: z.literal('session_patch'),
    sid: EntityIdSchema,
    at: IsoDateTimeSchema,
    patch: SessionPatchSchema,
  }),
  z.object({
    t: z.literal('session_created'),
    at: IsoDateTimeSchema,
    session: OrderSessionSchema,
  }),
  // OrderBook só tem 7 campos escalares — nunca precisa de delta, sempre o
  // objeto inteiro.
  z.object({
    t: z.literal('book_upsert'),
    book: OrderBookSchema,
  }),
]);
export type RealtimeEvent = z.infer<typeof RealtimeEventSchema>;

// ---------------------------------------------------------------------------
// Mapas de eventos do Socket.IO (generics de TypeScript)
// ---------------------------------------------------------------------------
// Os schemas Zod acima validam em RUNTIME (o que chega pelo fio é sempre
// entrada não confiável); os tipos abaixo validam em COMPILE-TIME as chamadas
// de `emit`/`on`/ack nos dois lados. Os dois coexistem de propósito — a doc
// oficial é explícita: "These type hints do not replace proper
// validation/sanitization of the input" (ver
// documents/knowledge/socket.io/doc/typescript.md).
//
// Este arquivo é a fonte única (scripts/sync-contracts.mjs copia pro
// frontend), então servidor e cliente derivam os generics do MESMO tipo: um
// evento renomeado ou um payload alterado quebra a compilação dos dois lados
// na mesma hora, em vez de virar um `any` silencioso em produção.

/** Quem está com a sessão de pedido aberta agora (presença em memória do
 * namespace /pedidos — não é o mesmo que OrderSessionParticipant, que é a
 * participação persistida no banco). */
export interface PedidoPresence {
  userId: string;
  role: UserRole;
  name: string;
}

/** Resposta padrão de ack dos eventos cliente→servidor. */
export interface RealtimeAck {
  ok: boolean;
  motivo?: string;
}

export interface CriarSessaoClienteAck extends RealtimeAck {
  session?: OrderSession;
  /** Sem vendedora disponível: o carrinho continua local e o checkout direto
   * segue possível — é aviso de atendimento, não erro (ver
   * pedidosNamespace.ts). */
  pendingAssignment?: boolean;
  aviso?: string;
}

/** Payload de `atualizar_sessao`. O servidor revalida com
 * UpdateOrderSessionInputSchema (orderSessionService.updateSession) — este
 * tipo existe pra o cliente não montar um payload fora do contrato, não pra
 * dispensar a validação. */
export interface AtualizarSessaoPayload {
  itemsDelta: { set: CartItem[]; del: string[] };
}

/** Payload de `criar_sessao_cliente` (revalidado por
 * EnsureCustomerOrderSessionSchema no servidor). */
export interface CriarSessaoClientePayload {
  items: CartItem[];
}

/** /pedidos — servidor → cliente. */
export interface PedidosServerToClientEvents {
  sessao_snapshot: (session: OrderSession) => void;
  sessao_atualizada: (session: OrderSession) => void;
  presenca_atualizada: (presence: PedidoPresence[]) => void;
  participantes_atualizados: (participants: OrderSessionParticipant[]) => void;
}

/** /pedidos — cliente → servidor. O ack é opcional só em `entrar_sessao`
 * (o cliente emite sem esperar resposta); nos outros dois ele é obrigatório
 * porque o cliente usa `socket.timeout(...).emit(...)`, e o utilitário
 * `Last<>` do socket.io-client precisa do ack como último parâmetro
 * não-opcional pra inferir o tipo da resposta. */
export interface PedidosClientToServerEvents {
  entrar_sessao: (payload: Record<string, never>, ack?: (res: RealtimeAck) => void) => void;
  criar_sessao_cliente: (payload: CriarSessaoClientePayload, ack: (res: CriarSessaoClienteAck) => void) => void;
  atualizar_sessao: (payload: AtualizarSessaoPayload, ack: (res: RealtimeAck) => void) => void;
  sair_sessao: () => void;
}

/** Sinal legado sem payload do namespace /atualizacoes — as telas que ainda
 * não migraram pro `atualizacao_v2` reagem com refetch. */
export type RealtimeUpdate =
  | 'sessions_updated'
  | 'orders_updated'
  | 'order_books_updated'
  | 'notifications_updated';

/** /atualizacoes — servidor → cliente. */
export interface AtualizacoesServerToClientEvents {
  atualizacao: (payload: { type: RealtimeUpdate }) => void;
  atualizacao_v2: (event: RealtimeEvent) => void;
}

/** /atualizacoes — cliente → servidor: nenhum. O canal é unidirecional; o
 * cliente só entra nas rooms derivadas do ticket e escuta. */
export type AtualizacoesClientToServerEvents = Record<string, never>;

/** Comunicação servidor↔servidor (`io.serverSideEmit`) — só existe com o
 * adapter Redis ligado (backend/src/realtime/redisAdapter.ts) e nunca chega a
 * um navegador. O Socket.IO não entrega o evento pra própria Machine que
 * emitiu. */
export interface RealtimeInterServerEvents {
  /** Um tenant mudou de status: as OUTRAS Machines descartam o cache local de
   * slug → tenant (backend/src/lib/db/tenant.ts) em vez de esperar o TTL. */
  tenant_invalidated: (slug: string) => void;
}
