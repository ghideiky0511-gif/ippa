import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken, SESSION_COOKIE } from '@/lib/auth';
import { readOrderSessions, writeOrderSessions } from '@/lib/orderSessions';
import { readClients, writeClients } from '@/lib/clients';
import { notifySession } from '@/lib/sseHub';
import type { OrderSession } from '@/lib/types';

// Atualiza um talão (itens do carrinho, notas, vincular cadastro de
// cliente, ou abrir/fechar a sessão). Dois papéis podem chamar isso agora:
// a vendedora dona da sessão (acesso total, como sempre) OU a cliente
// vinculada a ela (`session.clientId === user.clientId`) — desde que o
// carrinho dela vire de fato o mesmo pedido da vendedora (ver
// ClientSessionProvider.tsx/CartProvider.tsx). A cliente só pode mexer em
// `items`/`shipping`: não pode fechar a sessão da vendedora, mudar notas
// nem trocar o cadastro vinculado — esses campos são ignorados quando quem
// chama é a cliente. `items` substitui a lista inteira (mesmo padrão do
// resto do app: quem chama manda o estado final, não um diff). `status`
// aceita ida e volta (fechar e depois reabrir, ver "buscar existentes" no
// talão). `clientId` vincula um cadastro (ver web/src/lib/clients.ts) —
// sincroniza `clientName` a partir do cadastro e marca essa vendedora como
// a última que atendeu essa cliente (`lastSellerId`, usado por
// web/src/lib/assignment.ts quando ela voltar a montar carrinho sozinha).
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await getUserFromToken(token);
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 });
  }

  const sessions = await readOrderSessions();
  const index = sessions.findIndex((s) => s.id === id);
  if (index === -1) {
    return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 404 });
  }
  const current = sessions[index];
  const isOwnerSeller = user.role === 'vendedora' && current.sellerId === user.id;
  const isOwnerClient = user.role === 'cliente' && !!current.clientId && current.clientId === user.clientId;
  if (!isOwnerSeller && !isOwnerClient) {
    return NextResponse.json({ error: 'Sem permissão pra essa sessão.' }, { status: 403 });
  }

  let clientId = current.clientId;
  let clientName = current.clientName;
  let notes = current.notes;
  let status = current.status;

  // Vincular cadastro, notas e trocar status são ações exclusivas da
  // vendedora — a cliente só edita o pedido em si (items/shipping).
  if (isOwnerSeller) {
    if (typeof body.clientId === 'string' && body.clientId) {
      const clients = await readClients();
      const clientIndex = clients.findIndex((c) => c.id === body.clientId);
      if (clientIndex === -1) {
        return NextResponse.json({ error: 'Cadastro de cliente não encontrado.' }, { status: 404 });
      }
      clientId = clients[clientIndex].id;
      clientName = clients[clientIndex].name;
      clients[clientIndex] = { ...clients[clientIndex], lastSellerId: user.id, updatedAt: new Date().toISOString() };
      await writeClients(clients);
    }
    notes = typeof body.notes === 'string' ? body.notes : current.notes;
    const validStatus = ['aberto', 'fechado', 'aguardando_pagamento'];
    status = validStatus.includes(body.status) ? body.status : current.status;
  }

  const shipping =
    body.shipping === null
      ? undefined
      : body.shipping && typeof body.shipping === 'object' && typeof body.shipping.price === 'number'
        ? body.shipping
        : current.shipping;

  // Reabrir uma sessão que estava aguardando pagamento invalida o link
  // antigo — sem isso ele continuaria "vivo" (e, com expiração, poderia
  // reabrir contando tempo errado a partir de quando foi gerado antes).
  const reopening = status === 'aberto' && current.status !== 'aberto';

  const updated: OrderSession = {
    ...current,
    clientId,
    clientName,
    items: Array.isArray(body.items) ? body.items : current.items,
    shipping,
    notes,
    status,
    paymentToken: reopening ? undefined : current.paymentToken,
    paymentTokenCreatedAt: reopening ? undefined : current.paymentTokenCreatedAt,
    updatedAt: new Date().toISOString(),
  };
  sessions[index] = updated;
  await writeOrderSessions(sessions);
  notifySession(updated);

  return NextResponse.json(updated);
}
