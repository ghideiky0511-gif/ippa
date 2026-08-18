import { NextRequest } from 'next/server';
import { getUserFromToken, SESSION_COOKIE } from '@/lib/auth';
import { subscribe, unsubscribe, sellerSubject, clientSubject } from '@/lib/sseHub';

// Canal de tempo real da vendedora OU da cliente logada — ver
// web/src/lib/sseHub.ts pro porquê (canal por assunto seller:<id> ou
// client:<id>, não broadcast). Assinado por TalaoProvider.tsx (vendedora) ou
// ClientSessionProvider.tsx (cliente) no mount; evento 'sessions-updated'
// dispara um refetch de GET /api/sessions ou /api/sessions/mine ali, é só
// isso — o hub não manda o dado em si.
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await getUserFromToken(token);
  const subject =
    user?.role === 'vendedora' ? sellerSubject(user.id) : user?.role === 'cliente' && user.clientId ? clientSubject(user.clientId) : null;
  if (!subject) {
    return new Response('Não autenticado.', { status: 401 });
  }

  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
  let heartbeat: ReturnType<typeof setInterval>;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
      subscribe(subject, controller);
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
      if (controllerRef) unsubscribe(subject, controllerRef);
    },
  });

  request.signal.addEventListener('abort', () => {
    clearInterval(heartbeat);
    if (controllerRef) unsubscribe(subject, controllerRef);
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
