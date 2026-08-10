import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken, SESSION_COOKIE } from '@/lib/auth';
import { readClients, writeClients } from '@/lib/clients';

// Espelha o carrinho PESSOAL da cliente logada (fora de sessão de talão) no
// cadastro dela — não é lido pra montar nenhuma tela hoje (CartProvider.tsx
// continua usando localStorage pra exibir o carrinho de verdade), é só
// captura de dado pra análise futura: quantas clientes montam carrinho e
// não finalizam ("carrinho abandonado"), ver Client.cart em types.ts. Só a
// própria cliente pode gravar o próprio carrinho — nunca a vendedora, nunca
// outro id.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await getUserFromToken(token);
  if (!user || user.role !== 'cliente' || user.clientId !== id) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.cart)) {
    return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 });
  }

  const clients = await readClients();
  const index = clients.findIndex((c) => c.id === id);
  if (index === -1) {
    return NextResponse.json({ error: 'Cadastro não encontrado.' }, { status: 404 });
  }

  clients[index] = { ...clients[index], cart: body.cart, cartUpdatedAt: new Date().toISOString() };
  await writeClients(clients);

  return NextResponse.json({ ok: true });
}
