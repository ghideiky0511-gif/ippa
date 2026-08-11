import type { OrderSession } from './types';

// Hub de SSE em memória, um canal por "assunto" — `seller:<sellerId>` (a
// vendedora dona do talão) ou `client:<clientId>` (a cliente vinculada a
// ele, quando existe) — não é broadcast geral (ver decisão registrada em
// PLANO-PROXIMOS-PASSOS.md, "Estratégia de tempo real"). Os dois papéis
// cabem no mesmo Map porque os prefixos nunca colidem. Eventos: qualquer
// PUT em /api/sessions/[id] (vendedora OU cliente editando o mesmo
// pedido), a cliente pagar pelo link (POST /api/pay/[token]), a cliente
// fechar a compra direto (POST /api/orders) e o gatilho de fila criar uma
// sessão nova no signup — ver notifySession abaixo, chamada por todos esses
// pontos. Só funciona com um processo Node único (mesma ressalva já
// documentada: escalar horizontalmente exigiria pub/sub compartilhado, ex.
// Redis).
type Controller = ReadableStreamDefaultController<Uint8Array>;

// globalThis, não uma const de módulo — em dev, rotas diferentes podem
// acabar em bundles/instâncias de módulo separadas mesmo rodando no mesmo
// processo Node, e um Map só em memória de módulo não seria compartilhado
// entre elas (o assinante nunca receberia o evento). globalThis garante uma
// única instância pro processo inteiro, mesmo padrão usado pra singletons
// de cliente de banco em apps Next.js.
const globalForSse = globalThis as unknown as { __sseSubscribers?: Map<string, Set<Controller>> };
const subscribers = globalForSse.__sseSubscribers ?? (globalForSse.__sseSubscribers = new Map());

export function sellerSubject(sellerId: string): string {
  return `seller:${sellerId}`;
}

export function clientSubject(clientId: string): string {
  return `client:${clientId}`;
}

export function subscribe(subject: string, controller: Controller) {
  if (!subscribers.has(subject)) subscribers.set(subject, new Set());
  subscribers.get(subject)!.add(controller);
}

export function unsubscribe(subject: string, controller: Controller) {
  subscribers.get(subject)?.delete(controller);
}

const encoder = new TextEncoder();

function notify(subject: string) {
  const chunk = encoder.encode('event: sessions-updated\ndata: {}\n\n');
  for (const controller of subscribers.get(subject) || []) {
    try {
      controller.enqueue(chunk);
    } catch {
      // conexão já fechada — cancel() do stream cuida de remover do Set
    }
  }
}

// Avisa a vendedora dona da sessão e, se houver cadastro de cliente
// vinculado, a própria cliente também — os dois lados do mesmo pedido
// atualizam sem F5 (ver ClientSessionProvider.tsx / TalaoProvider.tsx, que
// assinam e refetcham no evento 'sessions-updated').
export function notifySession(session: Pick<OrderSession, 'sellerId' | 'clientId'>) {
  notify(sellerSubject(session.sellerId));
  if (session.clientId) notify(clientSubject(session.clientId));
}
