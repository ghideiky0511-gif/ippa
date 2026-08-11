import { NextRequest, NextResponse } from 'next/server';
import { listUsersWithoutPasswords, createUser } from '@/lib/auth';
import { readClients } from '@/lib/clients';
import { sendSignupConfirmationEmail } from '@/lib/email';

// Lista combinada de contas (vendedora + cliente) pra aba "Usuários" da
// plataforma admin — junta users.json (sem passwordHash, ver
// listUsersWithoutPasswords em web/src/lib/auth.ts) com o cadastro em
// clients.json quando o usuário é uma cliente (AuthUser.clientId), pra
// mostrar CPF/CNPJ junto — mesmo padrão CORS de /api/store-settings, porque
// o admin roda numa origem separada (porta 3001 em dev). POST cria conta de
// VENDEDORA — é o único jeito de virar vendedora hoje (não existe
// autocadastro público pra esse papel, ver POST /api/auth/signup, que
// sempre cria role 'cliente'); de propósito, pra acesso ao talão não ser
// algo que qualquer visitante ganha sozinho.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.ADMIN_ORIGIN || 'http://localhost:3001',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  const [users, clients] = await Promise.all([listUsersWithoutPasswords(), readClients()]);
  const clientsById = Object.fromEntries(clients.map((c) => [c.id, c]));

  const rows = users.map((u) => {
    const client = u.clientId ? clientsById[u.clientId] : undefined;
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      cpfCnpj: client?.cpfCnpj,
      lastSellerId: client?.lastSellerId,
      createdAt: client?.createdAt,
    };
  });

  return NextResponse.json(rows, { headers: CORS_HEADERS });
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

  try {
    const user = await createUser({ email, password, name, role: 'vendedora' });
    sendSignupConfirmationEmail({ to: user.email, name: user.name });
    return NextResponse.json(user, { status: 201, headers: CORS_HEADERS });
  } catch (err) {
    if (err instanceof Error && err.message === 'EMAIL_TAKEN') {
      return NextResponse.json({ error: 'Já existe uma conta com esse e-mail.' }, { status: 409, headers: CORS_HEADERS });
    }
    throw err;
  }
}
