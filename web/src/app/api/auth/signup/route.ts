import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createUser, createSessionToken, SESSION_COOKIE } from '@/lib/auth';
import { readClients, writeClients } from '@/lib/clients';
import type { Client } from '@/lib/types';

// Autocadastro da cliente final (combinado com o usuário: cadastro completo
// de uma vez — nome, e-mail, senha, CPF/CNPJ e endereço inteiro — diferente
// do cadastro parcial que a vendedora pode criar no talão, ver
// POST /api/clients). Cria o Client e o AuthUser (role 'cliente') juntos,
// vinculados por clientId.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const cpfCnpj = typeof body?.cpfCnpj === 'string' ? body.cpfCnpj.trim() : '';
  const cep = typeof body?.cep === 'string' ? body.cep.trim() : '';
  const street = typeof body?.street === 'string' ? body.street.trim() : '';
  const number = typeof body?.number === 'string' ? body.number.trim() : '';
  const complement = typeof body?.complement === 'string' ? body.complement.trim() : '';
  const neighborhood = typeof body?.neighborhood === 'string' ? body.neighborhood.trim() : '';
  const city = typeof body?.city === 'string' ? body.city.trim() : '';
  const state = typeof body?.state === 'string' ? body.state.trim() : '';
  // Sempre opcionais — nunca entram na validação de obrigatórios abaixo.
  const companyResponsible = typeof body?.companyResponsible === 'string' ? body.companyResponsible.trim() : '';
  const storeName = typeof body?.storeName === 'string' ? body.storeName.trim() : '';

  if (!name || !email || !password || !cpfCnpj || !cep || !street || !number || !neighborhood || !city || !state) {
    return NextResponse.json(
      { error: 'Preencha nome, e-mail, senha, CPF/CNPJ, CEP, Rua, Número, Bairro, Cidade e Estado.' },
      { status: 400 }
    );
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'A senha precisa ter pelo menos 6 caracteres.' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const client: Client = {
    id: randomUUID(),
    name,
    cpfCnpj,
    email,
    cep,
    street,
    number,
    complement: complement || undefined,
    neighborhood,
    city,
    state,
    companyResponsible: companyResponsible || undefined,
    storeName: storeName || undefined,
    createdAt: now,
    updatedAt: now,
  };

  let user;
  try {
    user = await createUser({ email, password, name, role: 'cliente', clientId: client.id });
  } catch (err) {
    if (err instanceof Error && err.message === 'EMAIL_TAKEN') {
      return NextResponse.json({ error: 'Já existe uma conta com esse e-mail.' }, { status: 409 });
    }
    throw err;
  }

  const clients = await readClients();
  clients.push(client);
  await writeClients(clients);

  const token = await createSessionToken(user.id);
  const res = NextResponse.json({ user });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
