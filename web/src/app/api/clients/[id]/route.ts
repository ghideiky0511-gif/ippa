import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken, SESSION_COOKIE, hasLoginForClient } from '@/lib/auth';
import { readClients, writeClients } from '@/lib/clients';
import type { Client } from '@/lib/types';

// Busca um cadastro específico — usado pelo gate de "cadastro completo"
// antes do frete no talão (ver useTalaoClientGate.ts): a sessão guarda só
// o clientId, então a página de frete/pagamento precisa buscar o cadastro
// completo pra checar isClientComplete(). Também usado pela própria cliente
// logada (ver web/src/app/frete/page.tsx) pra reaproveitar o CEP salvo no
// cadastro — por isso a segunda condição abaixo: só o PRÓPRIO cadastro
// (clientId da sessão precisa bater com o id pedido), nunca o de outra.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await getUserFromToken(token);
  const isOwnClient = user?.role === 'cliente' && user.clientId === id;
  if (!user || (user.role !== 'vendedora' && !isOwnClient)) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const clients = await readClients();
  const client = clients.find((c) => c.id === id);
  if (!client) {
    return NextResponse.json({ error: 'Cadastro não encontrado.' }, { status: 404 });
  }
  // hasLogin: computado (não é campo do Client) — se existe um AuthUser com
  // esse clientId, ver hasLoginForClient em web/src/lib/auth.ts. Usado por
  // useTalaoClientGate.ts (bloqueia frete/pagamento sem login) e por
  // TalaoDrawer.tsx (mostra "criar login" só quando ainda não tem).
  const hasLogin = await hasLoginForClient(id);
  return NextResponse.json({ ...client, hasLogin });
}

// Completa/edita um cadastro (ex.: a vendedora tinha só o nome, agora
// preenche CPF/CNPJ, email, CEP pra poder fechar o pedido).
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await getUserFromToken(token);
  if (!user || user.role !== 'vendedora') {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 });
  }

  const clients = await readClients();
  const index = clients.findIndex((c) => c.id === id);
  if (index === -1) {
    return NextResponse.json({ error: 'Cadastro não encontrado.' }, { status: 404 });
  }

  const current = clients[index];
  const updated: Client = {
    ...current,
    name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : current.name,
    cpfCnpj: typeof body.cpfCnpj === 'string' ? body.cpfCnpj.trim() || undefined : current.cpfCnpj,
    email: typeof body.email === 'string' ? body.email.trim() || undefined : current.email,
    cep: typeof body.cep === 'string' ? body.cep.trim() || undefined : current.cep,
    companyResponsible: typeof body.companyResponsible === 'string' ? body.companyResponsible.trim() || undefined : current.companyResponsible,
    storeName: typeof body.storeName === 'string' ? body.storeName.trim() || undefined : current.storeName,
    updatedAt: new Date().toISOString(),
  };
  clients[index] = updated;
  await writeClients(clients);

  return NextResponse.json(updated);
}
