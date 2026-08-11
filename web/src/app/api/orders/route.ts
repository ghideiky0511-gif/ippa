import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken, SESSION_COOKIE } from '@/lib/auth';
import { readOrderHistory, writeOrderHistory } from '@/lib/orderHistory';
import { readOrderSessions, writeOrderSessions } from '@/lib/orderSessions';
import { notifySession } from '@/lib/sseHub';
import { readStoreSettings } from '@/lib/storeSettings';
import type { Order } from '@/lib/types';

// Pedidos da CONTA logada (ver web/src/app/pedidos/page.tsx, "Meus
// pedidos"/"Minhas vendas" conforme o role) — diferente do histórico antigo
// por navegador (localStorage, ver readOrders em CartProvider.tsx), que
// continua existindo só pra quem não está logada. Uma cliente vê só o que é
// dela (clientId, inclui pedidos fechados por uma vendedora via link de
// pagamento — POST /api/pay/[token] também grava clientId); uma vendedora
// vê as vendas que ELA fechou (sellerId, só as via link de pagamento, que é
// o único caminho que grava sellerId hoje).
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await getUserFromToken(token);
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const orders = await readOrderHistory();
  if (user.role === 'cliente' && user.clientId) {
    return NextResponse.json(orders.filter((o) => o.clientId === user.clientId));
  }
  if (user.role === 'vendedora') {
    return NextResponse.json(orders.filter((o) => o.sellerId === user.id));
  }
  return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
}

// Grava um pedido feito pela própria cliente logada (autocompra — ver
// saveOrderToHistory em CartProvider.tsx). clientId nunca vem do corpo, é
// sempre o da sessão — ninguém grava pedido na conta de outra pessoa.
// `sessionId` opcional (quando o carrinho vinha de uma sessão de talão
// atribuída a ela, ver ClientSessionProvider.tsx): resolve `sellerId` a
// partir da PRÓPRIA sessão (nunca de um sellerId solto no corpo — só assim
// dá pra confiar), pra o pedido aparecer em "Minhas vendas" da vendedora, e
// fecha a sessão (sem limpar items, mesmo padrão de POST /api/pay/[token]).
export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await getUserFromToken(token);
  if (!user || user.role !== 'cliente' || !user.clientId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.items) || typeof body.total !== 'number' || typeof body.channel !== 'string') {
    return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 });
  }

  let sellerId: string | undefined;
  if (typeof body.sessionId === 'string' && body.sessionId) {
    const sessions = await readOrderSessions();
    const index = sessions.findIndex((s) => s.id === body.sessionId);
    if (index !== -1 && sessions[index].clientId === user.clientId) {
      // Ferramenta "cliente finaliza sozinha" (/ferramentas) — desligada,
      // um pedido vinculado a talão só pode fechar pela vendedora (link de
      // pagamento ou fechamento manual). Checagem no servidor porque o
      // gate do lado do cliente (useClientSelfCheckoutGate.ts) é só UI —
      // sem isso, dava pra confirmar direto pela API ignorando o toggle.
      const settings = await readStoreSettings();
      if (settings.features?.clientSelfCheckout === false) {
        return NextResponse.json(
          { error: 'Esse pedido só pode ser finalizado pela vendedora — peça o link de pagamento ou aguarde ela fechar.' },
          { status: 403 }
        );
      }
      const session = sessions[index];
      sellerId = session.sellerId;
      sessions[index] = { ...session, status: 'fechado', updatedAt: new Date().toISOString() };
      await writeOrderSessions(sessions);
      notifySession(sessions[index]);
    }
  }

  const order: Order = {
    id: typeof body.id === 'string' && body.id ? body.id : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: typeof body.date === 'string' ? body.date : new Date().toISOString(),
    items: body.items,
    total: body.total,
    channel: body.channel,
    shipping: body.shipping,
    paymentMethod: typeof body.paymentMethod === 'string' ? body.paymentMethod : undefined,
    discount: body.discount,
    clientId: user.clientId,
    sellerId,
    clientName: user.name,
  };

  const orders = await readOrderHistory();
  await writeOrderHistory([order, ...orders]);

  return NextResponse.json(order);
}
