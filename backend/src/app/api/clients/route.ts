import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken, SESSION_COOKIE } from '@/lib/auth';
import { readClients, writeClients, findClientByDocument } from '@/lib/clients';
import type { Client } from '@/lib/types';

// Cadastro de cliente — hoje só a vendedora cria/busca (presencial ou
// WhatsApp); autocadastro da cliente é uma fase futura (ver
// PLANO-PROXIMOS-PASSOS.md). GET busca por nome/CPF-CNPJ pra vincular um
// cadastro já existente a uma sessão em vez de duplicar; POST cria um novo
// (pode ser parcial — só nome é obrigatório, o resto completa depois, ver
// isClientComplete em web/src/lib/clientComplete.ts).
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await getUserFromToken(token);
  if (!user || user.role !== 'vendedora') {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get('q')?.trim().toLowerCase() || '';
  const clients = await readClients();
  if (!q) return NextResponse.json(clients.slice(0, 20));

  const results = clients
    .filter((c) => c.name.toLowerCase().includes(q) || (c.cpfCnpj || '').toLowerCase().includes(q))
    .slice(0, 20);
  return NextResponse.json(results);
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await getUserFromToken(token);
  if (!user || user.role !== 'vendedora') {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return NextResponse.json({ error: 'Informe o nome da cliente.' }, { status: 400 });
  }
  const cpfCnpj = typeof body.cpfCnpj === 'string' ? body.cpfCnpj.trim() || undefined : undefined;

  const clients = await readClients();
  if (cpfCnpj && findClientByDocument(clients, cpfCnpj)) {
    return NextResponse.json({ error: 'Já existe cadastro com esse CPF/CNPJ — busque acima pra vincular em vez de criar outro.' }, { status: 409 });
  }

  const now = new Date().toISOString();
  const client: Client = {
    id: randomUUID(),
    name,
    cpfCnpj,
    email: typeof body.email === 'string' ? body.email.trim() || undefined : undefined,
    cep: typeof body.cep === 'string' ? body.cep.trim() || undefined : undefined,
    companyResponsible: typeof body.companyResponsible === 'string' ? body.companyResponsible.trim() || undefined : undefined,
    storeName: typeof body.storeName === 'string' ? body.storeName.trim() || undefined : undefined,
    lastSellerId: user.id,
    createdAt: now,
    updatedAt: now,
  };

  clients.push(client);
  await writeClients(clients);

  return NextResponse.json(client);
}
