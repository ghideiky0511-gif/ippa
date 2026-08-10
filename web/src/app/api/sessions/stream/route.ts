import { NextRequest } from 'next/server';
import { getUserFromToken, SESSION_COOKIE } from '@/lib/auth';
import { subscribe, unsubscribe } from '@/lib/sseHub';

// Canal de tempo real da vendedora logada — ver web/src/lib/sseHub.ts pro
// porquê (canal por sellerId, não broadcast). Assinado por
// TalaoProvider.tsx no mount; evento 'sessions-updated' dispara um refetch
// de GET /api/sessions ali, é só isso — o hub não manda o dado em si.
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await getUserFromToken(token);
  if (!user || user.role !== 'vendedora') {
    return new Response('Não autenticado.', { status: 401 });
  }

  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
  let heartbeat: ReturnType<typeof setInterval>;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
      subscribe(user.id, controller);
      controller.enqueue(new TextEncoder().encode(': conectado\n\n'));
      // Comentário SSE periódico só pra manter a conexão viva através de
      // proxies que fecham conexões ociosas — não carrega dado nenhum.
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(': ping\n\n'));
        } catch {
          clearInterval(heartbeat);
        }
      }, 25000);
    },
    cancel() {
      clearInterval(heartbeat);
      if (controllerRef) unsubscribe(user.id, controllerRef);
    },
  });

  request.signal.addEventListener('abort', () => {
    clearInterval(heartbeat);
    if (controllerRef) unsubscribe(user.id, controllerRef);
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
