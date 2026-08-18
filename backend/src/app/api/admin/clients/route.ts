import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createUser } from '@/lib/auth';
import { readClients, writeClients, deleteClient, findClientByDocument } from '@/lib/clients';
import { sendSignupConfirmationEmail } from '@/lib/email';
import type { Client } from '@/lib/types';

// Cria um cadastro de cliente COMPLETO (Client + login) direto pela
// plataforma admin — diferente do cadastro rápido que a vendedora faz no
// talão (POST /api/clients, só nome) ou do autocadastro público (POST
// /api/auth/signup): aqui o admin já entra com tudo, inclusive senha de
// acesso, pra casos em que a cliente não passa por nenhum dos dois fluxos
// normais. Mesmo padrão CORS de ../users/route.ts.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.ADMIN_ORIGIN || 'http://localhost:3010',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!name || !email || !password) {
    return NextResponse.json({ error: 'Informe nome, e-mail e senha.' }, { status: 400, headers: CORS_HEADERS });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'A senha precisa ter pelo menos 6 caracteres.' }, { status: 400, headers: CORS_HEADERS });
  }

  const cpfCnpj = typeof body.cpfCnpj === 'string' ? body.cpfCnpj.trim() || undefined : undefined;
  const clients = await readClients();
  if (cpfCnpj && findClientByDocument(clients, cpfCnpj)) {
    return NextResponse.json({ error: 'Já existe cadastro com esse CPF/CNPJ.' }, { status: 409, headers: CORS_HEADERS });
  }

  const now = new Date().toISOString();
  const client: Client = {
    id: randomUUID(),
    name,
    cpfCnpj,
    email: typeof body.clientEmail === 'string' ? body.clientEmail.trim() || undefined : email,
    cep: typeof body.cep === 'string' ? body.cep.trim() || undefined : undefined,
    street: typeof body.street === 'string' ? body.street.trim() || undefined : undefined,
    number: typeof body.number === 'string' ? body.number.trim() || undefined : undefined,
    complement: typeof body.complement === 'string' ? body.complement.trim() || undefined : undefined,
    neighborhood: typeof body.neighborhood === 'string' ? body.neighborhood.trim() || undefined : undefined,
    city: typeof body.city === 'string' ? body.city.trim() || undefined : undefined,
    state: typeof body.state === 'string' ? body.state.trim() || undefined : undefined,
    companyResponsible: typeof body.companyResponsible === 'string' ? body.companyResponsible.trim() || undefined : undefined,
    storeName: typeof body.storeName === 'string' ? body.storeName.trim() || undefined : undefined,
    createdAt: now,
    updatedAt: now,
  };
  clients.push(client);
  await writeClients(clients);

  try {
    const user = await createUser({ email, password, name, role: 'cliente', clientId: client.id });
    sendSignupConfirmationEmail({ to: user.email, name: user.name });
    return NextResponse.json({ ...user, clientId: client.id, cpfCnpj: client.cpfCnpj }, { status: 201, headers: CORS_HEADERS });
  } catch (err) {
    // Login não pôde ser criado (e-mail já em uso) — não deixa o Client
    // órfão sem login nenhum pra trás.
    await deleteClient(client.id);
    if (err instanceof Error && err.message === 'EMAIL_TAKEN') {
      return NextResponse.json({ error: 'Já existe uma conta com esse e-mail.' }, { status: 409, headers: CORS_HEADERS });
    }
    throw err;
  }
}
