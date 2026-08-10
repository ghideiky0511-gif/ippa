import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { readOrderSessions, writeOrderSessions } from '@/lib/orderSessions';
import { readOrderHistory, writeOrderHistory } from '@/lib/orderHistory';
import { getCartDiscount } from '@/lib/discounts';
import { notifySessionsUpdated } from '@/lib/sseHub';
import type { Discount, Order } from '@/lib/types';

// Página pública de pagamento (web/src/app/pagar/[token]/page.tsx) — o
// token É a autenticação, sem exigir login da cliente (combinado com o
// usuário: "vendedora consegue fazer tudo pela cliente, menos finalizar o
// pagamento", ver POST /api/sessions/[id]/payment-link/route.ts, que gera
// esse token). Por isso NENHUM cookie/sessão é checado aqui.

async function readDiscounts(): Promise<Discount[]> {
  const raw = await readFile(path.join(process.cwd(), 'src/data/discounts.json'), 'utf-8');
  return JSON.parse(raw);
}

async function findSessionByToken(token: string) {
  const sessions = await readOrderSessions();
  const index = sessions.findIndex((s) => s.paymentToken === token);
  return { sessions, index, session: index === -1 ? null : sessions[index] };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { session } = await findSessionByToken(token);
  if (!session || session.status !== 'aguardando_pagamento') {
    return NextResponse.json({ error: 'Link inválido ou pedido já concluído.' }, { status: 404 });
  }

  const items = session.items.filter((i) => i.qty > 0);
  const discounts = await readDiscounts();
  const cartSubtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const cartDiscount = getCartDiscount(items, discounts);
  const cartTotal = cartSubtotal - cartDiscount.totalAmount;

  return NextResponse.json({
    clientName: session.clientName,
    items,
    cartSubtotal,
    cartDiscountLabel: cartDiscount.label,
    cartDiscountTotal: cartDiscount.totalAmount,
    cartTotal,
    shipping: session.shipping,
    total: cartTotal + (session.shipping?.price || 0),
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { sessions, index, session } = await findSessionByToken(token);
  if (!session || session.status !== 'aguardando_pagamento') {
    return NextResponse.json({ error: 'Link inválido ou pedido já concluído.' }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const paymentMethod = typeof body?.paymentMethod === 'string' ? body.paymentMethod : undefined;

  const items = session.items.filter((i) => i.qty > 0);
  const discounts = await readDiscounts();
  const cartSubtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const cartDiscount = getCartDiscount(items, discounts);
  const cartTotal = cartSubtotal - cartDiscount.totalAmount + (session.shipping?.price || 0);

  const order: Order = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: new Date().toISOString(),
    items,
    total: cartTotal,
    channel: session.channel,
    shipping: session.shipping,
    paymentMethod,
    discount: cartDiscount.totalAmount > 0 ? { label: cartDiscount.label!, amount: cartDiscount.totalAmount } : undefined,
    clientId: session.clientId,
    sellerId: session.sellerId,
    clientName: session.clientName,
  };

  const history = await readOrderHistory();
  await writeOrderHistory([order, ...history]);

  sessions[index] = {
    ...session,
    status: 'fechado',
    paymentToken: undefined,
    updatedAt: new Date().toISOString(),
  };
  await writeOrderSessions(sessions);

  // Avisa a vendedora dona da sessão, se ela estiver com o talão aberto
  // agora — ver web/src/lib/sseHub.ts e TalaoProvider.tsx (assina e
  // refetcha ao vivo, sem precisar de F5).
  notifySessionsUpdated(session.sellerId);

  return NextResponse.json({ ok: true, order });
}
