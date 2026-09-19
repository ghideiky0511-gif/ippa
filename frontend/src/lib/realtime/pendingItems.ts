import type { CartItem } from '@/domain/orders/types';
import { applyItemsDelta, diffCartItems } from '@/lib/cartItemsDelta';

/**
 * Overlay de alterações locais ainda não confirmadas pelo servidor, por cima
 * do estado confirmado (`activeSession.items`/`sessions[i].items`) — separa
 * o que a pessoa pediu do que o servidor já aceitou.
 *
 * Por quê: antes, a atualização otimista escrevia o valor desejado direto em
 * cima do MESMO estado que os eventos de `/pedidos` e `/atualizacoes`
 * também escrevem (`setActiveSession({...prev, items})`). O eco de
 * `session_items` que o servidor manda de volta pro autor da própria
 * mutação (ver o comentário de `set` em contracts/realtime.ts) carrega o
 * valor ABSOLUTO daquela mutação — que, numa sequência de cliques rápidos
 * (qty 1→2→3→4), é sempre um valor intermediário. Aplicado por cima do
 * estado otimista já em 4, o eco da mutação "2" fazia a tela piscar de
 * volta pra 2 antes dos ecos de "3" e "4" chegarem (ver histórico em
 * documents/knowledge/realtime-sockets.md).
 *
 * Com o overlay: o estado confirmado nunca é sobrescrito por um clique
 * local, e o que aparece na tela é confirmado + pendente. Um eco aplicado
 * ao estado confirmado nunca "volta" o que a pessoa já pediu, porque o
 * pedido mais recente continua no overlay até o PRÓPRIO eco dele confirmar
 * (settleBatch só some com uma chave quando o valor pendente ainda é
 * exatamente o que foi mandado).
 */
export type PendingItems = Map<string, CartItem | null>; // null = removido

export function createPendingItems(): PendingItems {
  return new Map();
}

/** Itens exibidos: confirmados + overlay pendente por cima. */
export function overlayPending(confirmed: CartItem[], pending: PendingItems): CartItem[] {
  if (pending.size === 0) return confirmed;
  const set: CartItem[] = [];
  const del: string[] = [];
  for (const [key, value] of pending) {
    if (value === null) del.push(key);
    else set.push(value);
  }
  return applyItemsDelta(confirmed, set, del);
}

/** Registra o que a pessoa pediu no mapa de pendências — `before`/`after`
 * devem ser os itens EXIBIDOS (já com qualquer overlay anterior aplicado),
 * pra um segundo clique acumular sobre o primeiro em vez de recomeçar do
 * estado confirmado. */
export function recordLocalChange(pending: PendingItems, before: CartItem[], after: CartItem[]): void {
  const { set, del } = diffCartItems(before, after);
  for (const item of set) pending.set(item.key, item);
  for (const key of del) pending.set(key, null);
}

/** Um lote pronto pra mandar em `atualizar_sessao`/`PUT /sessions/:id`,
 * junto com a foto do que foi enviado (usada por `settleBatch`). */
export interface PendingBatch {
  sent: Map<string, CartItem | null>;
  delta: { set: CartItem[]; del: string[] };
}

/** Nada pendente → null (nada a enviar). */
export function takeBatch(pending: PendingItems): PendingBatch | null {
  if (pending.size === 0) return null;
  const sent = new Map(pending);
  const set: CartItem[] = [];
  const del: string[] = [];
  for (const [key, value] of sent) {
    if (value === null) del.push(key);
    else set.push(value);
  }
  return { sent, delta: { set, del } };
}

/** Remove do mapa só as chaves cujo valor pendente ainda é (por identidade
 * de referência — cada clique grava um objeto novo) o que foi enviado nesse
 * lote. Uma chave alterada de novo DEPOIS do envio, enquanto o ack não
 * voltava, continua pendente pro próximo flush em vez de sumir cedo demais. */
export function settleBatch(pending: PendingItems, sent: Map<string, CartItem | null>): void {
  for (const [key, value] of sent) {
    if (pending.get(key) === value) pending.delete(key);
  }
}

export function clearPending(pending: PendingItems): void {
  pending.clear();
}
