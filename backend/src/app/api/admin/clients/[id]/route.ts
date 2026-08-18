import { NextRequest, NextResponse } from 'next/server';
import { readClients, writeClients, findClientByDocument } from '@/lib/clients';
import type { Client } from '@/lib/types';

// Edita o CADASTRO (Client) de uma cliente pela plataforma admin — nome,
// CPF/CNPJ, e-mail de contato, endereço completo, responsável/nome da loja.
// Separado de PUT /api/admin/users/[id] (que edita o LOGIN: nome/e-mail de
// acesso/senha) porque são dois registros diferentes (ver comentário em
// Client, types.ts) — a tela de edição do admin chama os dois quando
// necessário.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.ADMIN_ORIGIN || 'http://localhost:3010',
  'Access-Control-Allow-Methods': 'PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400, headers: CORS_HEADERS });
  }

  const clients = await readClients();
  const index = clients.findIndex((c) => c.id === id);
  if (index === -1) {
    return NextResponse.json({ error: 'Cadastro não encontrado.' }, { status: 404, headers: CORS_HEADERS });
  }

  const cpfCnpj = typeof body.cpfCnpj === 'string' ? body.cpfCnpj.trim() || undefined : undefined;
  if (cpfCnpj) {
    const dup = findClientByDocument(clients, cpfCnpj);
    if (dup && dup.id !== id) {
      return NextResponse.json({ error: 'Já existe outro cadastro com esse CPF/CNPJ.' }, { status: 409, headers: CORS_HEADERS });
    }
  }

  const current = clients[index];
  const updated: Client = {
    ...current,
    name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : current.name,
    cpfCnpj: typeof body.cpfCnpj === 'string' ? body.cpfCnpj.trim() || undefined : current.cpfCnpj,
    email: typeof body.clientEmail === 'string' ? body.clientEmail.trim() || undefined : current.email,
    cep: typeof body.cep === 'string' ? body.cep.trim() || undefined : current.cep,
    street: typeof body.street === 'string' ? body.street.trim() || undefined : current.street,
    number: typeof body.number === 'string' ? body.number.trim() || undefined : current.number,
    complement: typeof body.complement === 'string' ? body.complement.trim() || undefined : current.complement,
    neighborhood: typeof body.neighborhood === 'string' ? body.neighborhood.trim() || undefined : current.neighborhood,
    city: typeof body.city === 'string' ? body.city.trim() || undefined : current.city,
    state: typeof body.state === 'string' ? body.state.trim() || undefined : current.state,
    companyResponsible: typeof body.companyResponsible === 'string' ? body.companyResponsible.trim() || undefined : current.companyResponsible,
    storeName: typeof body.storeName === 'string' ? body.storeName.trim() || undefined : current.storeName,
    updatedAt: new Date().toISOString(),
  };
  clients[index] = updated;
  await writeClients(clients);

  return NextResponse.json(updated, { headers: CORS_HEADERS });
}
