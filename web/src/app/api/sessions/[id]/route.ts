import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken, SESSION_COOKIE } from '@/lib/auth';
import { readOrderSessions, writeOrderSessions } from '@/lib/orderSessions';
import { readClients, writeClients } from '@/lib/clients';
import type { OrderSession } from '@/lib/types';

// Atualiza um talão (itens do carrinho, notas, vincular cadastro de
// cliente, ou abrir/fechar a sessão) — só a vendedora dona da sessão pode
// alterar. `items` substitui a lista inteira (mesmo padrão do resto do
// app: cliente manda o estado final, não um diff) — é o que
// TalaoProvider.tsx faz a cada +/-/remover. `status` aceita ida e volta
// (fechar e depois reabrir, ver "buscar existentes" no talão). `clientId`
// vincula um cadastro (ver web/src/lib/clients.ts) — sincroniza
// `clientName` a partir do cadastro e marca essa vendedora como a última
// que atendeu essa cliente (`lastSellerId`, usado por
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
  if (sessions[index].sellerId !== user.id) {
    return NextResponse.json({ error: 'Sem permissão pra essa sessão.' }, { status: 403 });
  }

  const current = sessions[index];
  let clientId = current.clientId;
  let clientName = current.clientName;

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

  const updated: OrderSession = {
    ...current,
    clientId,
    clientName,
    items: Array.isArray(body.items) ? body.items : current.items,
    notes: typeof body.notes === 'string' ? body.notes : current.notes,
    status: body.status === 'fechado' || body.status === 'aberto' ? body.status : current.status,
    updatedAt: new Date().toISOString(),
  };
  sessions[index] = updated;
  await writeOrderSessions(sessions);

  return NextResponse.json(updated);
}
