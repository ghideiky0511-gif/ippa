export type AssignmentStrategy = 'leastBusy' | 'roundRobin' | 'any';

// Escolhe qual vendedora logada deve receber uma cliente nova (primeira
// vez montando carrinho sozinha) ou uma cuja última vendedora não está
// logada agora — ver regra combinada com o usuário em
// PLANO-PROXIMOS-PASSOS.md ("Talão de pedidos + login"). Estratégia
// configurável por loja (storeSettings.json `assignmentStrategy`, editável
// em /ferramentas): o padrão é "menos pedidos abertos agora", mas cada
// loja pode preferir outra — por isso isso é uma função pura com a
// estratégia como parâmetro, não uma regra fixa.
//
// Ainda não tem quem chame isso de verdade: depende do login/navegação da
// cliente existir (fase futura, ver plano). `openCountBySellerId` vem de
// countOpenSessionsBySeller() em web/src/lib/orderSessions.ts;
// `onlineSellerIds` vem de getOnlineVendedoraIds() em
// web/src/lib/auth.ts. `roundRobinCursor` é de quem chama guardar entre
// chamadas (ex. num contador em storeSettings.json) — sem ele, roundRobin
// vira "any".
export function pickSeller(
  onlineSellerIds: string[],
  openCountBySellerId: Record<string, number>,
  strategy: AssignmentStrategy = 'leastBusy',
  roundRobinCursor = 0
): string | null {
  if (onlineSellerIds.length === 0) return null;

  if (strategy === 'leastBusy') {
    return [...onlineSellerIds].sort(
      (a, b) => (openCountBySellerId[a] || 0) - (openCountBySellerId[b] || 0)
    )[0];
  }

  if (strategy === 'roundRobin') {
    return onlineSellerIds[roundRobinCursor % onlineSellerIds.length];
  }

  // 'any' — primeira vendedora logada, sem critério.
  return onlineSellerIds[0];
}
