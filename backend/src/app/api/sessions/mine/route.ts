import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken, SESSION_COOKIE, getAuthUserById } from '@/lib/auth';
import { readOrderSessions } from '@/lib/orderSessions';

// Sessão de talão ativa da CLIENTE logada — contraparte de GET /api/sessions
// (que é só pra vendedora). Devolve a sessão 'aberto' mais recente com
// clientId === user.clientId, ou null (sem vendedora atribuída ainda, ou
// nenhuma sessão aberta agora). Usado por ClientSessionProvider.tsx, que dá
// a CartProvider.tsx o mesmo pedido que a vendedora está vendo no talão —
// "aguardando_pagamento" não conta como ativa aqui porque nesse ponto quem
// fecha é a cliente pelo link, não editando o carrinho de novo.
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await getUserFromToken(token);
  if (!user || user.role !== 'cliente' || !user.clientId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const sessions = await readOrderSessions();
  const mine = sessions
    .filter((s) => s.clientId === user.clientId && s.status === 'aberto')
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const active = mine[0] || null;
  if (!active) return NextResponse.json(null);

  // sellerName: pro indicador "a vendedora X está no pedido com você" na
  // tela da cliente (PresenceBadge.tsx) — ver sellerName em types.ts.
  const seller = await getAuthUserById(active.sellerId);
  return NextResponse.json({ ...active, sellerName: seller?.name });
}
