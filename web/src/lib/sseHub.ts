// Hub de SSE em memória, um canal por vendedora (sellerId) — não é
// broadcast geral (ver decisão registrada em PLANO-PROXIMOS-PASSOS.md,
// "Estratégia de tempo real"). Único evento hoje: a cliente paga um pedido
// de talão através do link (POST /api/pay/[token]/route.ts) — a vendedora
// pode estar com o talão aberto enquanto isso acontece em outro navegador
// (o da cliente), sem nenhuma ação dela pra disparar um refetch. Só
// funciona com um processo Node único (mesma ressalva já documentada:
// escalar horizontalmente exigiria pub/sub compartilhado, ex. Redis).
type Controller = ReadableStreamDefaultController<Uint8Array>;

// globalThis, não uma const de módulo — em dev, rotas diferentes (esta e
// /api/pay/[token]/route.ts) podem acabar em bundles/instâncias de módulo
// separadas mesmo rodando no mesmo processo Node, e um Map só em memória de
// módulo não seria compartilhado entre elas (o assinante nunca receberia o
// evento). globalThis garante uma única instância pro processo inteiro,
// mesmo padrão usado pra singletons de cliente de banco em apps Next.js.
const globalForSse = globalThis as unknown as { __sseSubscribers?: Map<string, Set<Controller>> };
const subscribers = globalForSse.__sseSubscribers ?? (globalForSse.__sseSubscribers = new Map());

export function subscribe(sellerId: string, controller: Controller) {
  if (!subscribers.has(sellerId)) subscribers.set(sellerId, new Set());
  subscribers.get(sellerId)!.add(controller);
}

export function unsubscribe(sellerId: string, controller: Controller) {
  subscribers.get(sellerId)?.delete(controller);
}

const encoder = new TextEncoder();

export function notifySessionsUpdated(sellerId: string) {
  const chunk = encoder.encode('event: sessions-updated\ndata: {}\n\n');
  for (const controller of subscribers.get(sellerId) || []) {
    try {
      controller.enqueue(chunk);
    } catch {
      // conexão já fechada — cancel() do stream cuida de remover do Set
    }
  }
}
