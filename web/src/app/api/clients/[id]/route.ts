import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken, SESSION_COOKIE } from '@/lib/auth';
import { readClients, writeClients } from '@/lib/clients';
import type { Client } from '@/lib/types';

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
    updatedAt: new Date().toISOString(),
  };
  clients[index] = updated;
  await writeClients(clients);

  return NextResponse.json(updated);
}
