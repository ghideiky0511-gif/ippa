import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken, SESSION_COOKIE, hasLoginForClient } from '@/lib/auth';
import { readOrderSessions, writeOrderSessions } from '@/lib/orderSessions';
import { readClients } from '@/lib/clients';
import { isClientComplete } from '@/lib/clientComplete';
import { readStoreSettings, PAYMENT_LINK_EXPIRATION_DEFAULT_MINUTES } from '@/lib/storeSettings';
import type { OrderSession } from '@/lib/types';

async function isLinkValid(session: OrderSession): Promise<boolean> {
  if (!session.paymentToken || !session.paymentTokenCreatedAt) return false;
  const settings = await readStoreSettings();
  const minutes = settings.paymentLinkExpirationMinutes ?? PAYMENT_LINK_EXPIRATION_DEFAULT_MINUTES;
  return Date.now() - new Date(session.paymentTokenCreatedAt).getTime() <= minutes * 60_000;
}

// Gera o link de pagamento que a vendedora manda pra cliente (ver
// PLANO-PROXIMOS-PASSOS.md — "vendedora consegue fazer tudo pela cliente,
// menos finalizar o pagamento"). O token vira a própria autenticação do
// link (web/src/app/pagar/[token]/page.tsx, GET/POST /api/pay/[token]) —
// funciona sem a cliente estar logada, por isso as checagens abaixo (cliente
// vinculada e completa, carrinho não vazio, frete escolhido) precisam
// acontecer AQUI, antes de existir o link, e não podem depender de nada que
// só o navegador da vendedora sabe.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await getUserFromToken(token);
  if (!user || user.role !== 'vendedora') {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const sessions = await readOrderSessions();
  const index = sessions.findIndex((s) => s.id === id);
  if (index === -1) {
    return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 404 });
  }
  const session = sessions[index];
  if (session.sellerId !== user.id) {
    return NextResponse.json({ error: 'Sem permissão pra essa sessão.' }, { status: 403 });
  }

  const resolvedItems = session.items.filter((i) => i.qty > 0);
  if (resolvedItems.length === 0) {
    return NextResponse.json({ error: 'Adicione peças ao pedido antes de gerar o link.' }, { status: 400 });
  }
  if (!session.shipping) {
    return NextResponse.json({ error: 'Escolha o frete antes de gerar o link.' }, { status: 400 });
  }
  if (!session.clientId) {
    return NextResponse.json({ error: 'Vincule um cadastro de cliente antes de gerar o link.' }, { status: 400 });
  }
  const clients = await readClients();
  const client = clients.find((c) => c.id === session.clientId);
  if (!client || !isClientComplete(client)) {
    return NextResponse.json({ error: 'Complete o cadastro da cliente (CPF/CNPJ, e-mail, CEP) antes de gerar o link.' }, { status: 400 });
  }
  // Combinado com o usuário: mesmo pra gerar o link, a cliente precisa ter
  // login de verdade (não só o cadastro rápido) — ver
  // useTalaoClientGate.ts (checagem espelhada do lado da tela) e
  // POST /api/clients/[id]/create-login (onde a vendedora resolve isso).
  if (!(await hasLoginForClient(session.clientId))) {
    return NextResponse.json({ error: 'A cliente ainda não tem login — crie um pra ela antes de gerar o link.' }, { status: 400 });
  }

  // Reaproveita o token existente se ainda for válido (evita invalidar um
  // link que a cliente já pode ter aberto numa aba, só porque a vendedora
  // clicou em "gerar" de novo pra copiar) — só gera um novo quando não há
  // token ainda ou o anterior expirou (permite reenvio).
  if (await isLinkValid(session)) {
    return NextResponse.json({ token: session.paymentToken });
  }

  const paymentToken = randomBytes(24).toString('hex');
  sessions[index] = {
    ...session,
    paymentToken,
    paymentTokenCreatedAt: new Date().toISOString(),
    status: 'aguardando_pagamento',
    updatedAt: new Date().toISOString(),
  };
  await writeOrderSessions(sessions);

  return NextResponse.json({ token: paymentToken });
}
