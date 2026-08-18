import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken, SESSION_COOKIE } from '@/lib/auth';
import { readOrderSessions, writeOrderSessions } from '@/lib/orderSessions';
import type { OrderSession } from '@/lib/types';

// Talões da vendedora logada — cada uma só vê/cria os seus (ver
// OrderSession.sellerId). GET lista TODAS as sessões dela (aberta ou
// fechada) — o filtro por status é feito no cliente (TalaoProvider.tsx):
// "aberto" é o que aparece no painel do talão, o conjunto inteiro é usado
// pra "buscar existentes" (reabrir um pedido fechado). POST cria uma nova
// sessão — pode ser "pedido sem cliente" (clientName vazio, rascunho até
// vincular a uma cliente de verdade).
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await getUserFromToken(token);
  if (!user || user.role !== 'vendedora') {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const sessions = await readOrderSessions();
  return NextResponse.json(sessions.filter((s) => s.sellerId === user.id));
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await getUserFromToken(token);
  if (!user || user.role !== 'vendedora') {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const clientName = typeof body?.clientName === 'string' ? body.clientName.trim() : '';

  const now = new Date().toISOString();
  const session: OrderSession = {
    id: randomUUID(),
    clientName: clientName || 'Sem cliente',
    sellerId: user.id,
    channel: body.channel === 'whatsapp' ? 'whatsapp' : 'presencial',
    items: [],
    status: 'aberto',
    createdAt: now,
    updatedAt: now,
  };

  const sessions = await readOrderSessions();
  sessions.push(session);
  await writeOrderSessions(sessions);

  return NextResponse.json(session);
}
