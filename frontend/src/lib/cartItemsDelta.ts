import type { CartItem } from '@/domain/orders/types';

/** Espelha backend/src/services/orders/orderMapper.ts:diffCartItems — compara
 * por `key`; mudança de qty/price/backorderDate/suggested conta como `set`.
 * Usado para mandar só o que mudou em `atualizar_sessao`/`PUT /sessions/:id`
 * em vez do carrinho inteiro a cada mutação. */
export function diffCartItems(before: CartItem[], after: CartItem[]): { set: CartItem[]; del: string[] } {
  const beforeByKey = new Map(before.map((item) => [item.key, item]));
  const afterByKey = new Map(after.map((item) => [item.key, item]));
  const set: CartItem[] = [];
  const del: string[] = [];
  for (const [key, item] of afterByKey) {
    const previous = beforeByKey.get(key);
    const changed = !previous
      || previous.qty !== item.qty
      || previous.price !== item.price
      || previous.backorderDate !== item.backorderDate
      || previous.suggested !== item.suggested;
    if (changed) set.push(item);
  }
  for (const key of beforeByKey.keys()) {
    if (!afterByKey.has(key)) del.push(key);
  }
  return { set, del };
}

/** Inverso de diffCartItems — aplica um delta set/del sobre uma lista de
 * itens conhecida (usado tanto para os eventos recebidos de `session_items`
 * quanto, potencialmente, para reconstruir estado local a partir de um
 * delta). */
export function applyItemsDelta(items: CartItem[], set: CartItem[], del: readonly string[]): CartItem[] {
  const byKey = new Map(items.map((item) => [item.key, item]));
  for (const item of set) byKey.set(item.key, item);
  for (const key of del) byKey.delete(key);
  return Array.from(byKey.values());
}
