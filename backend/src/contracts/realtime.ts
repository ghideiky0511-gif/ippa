import { z } from 'zod';
import { CartItemSchema, EntityIdSchema, IsoDateTimeSchema } from './shared';
import { OrderBookSchema, OrderSessionSchema } from './orders';

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
