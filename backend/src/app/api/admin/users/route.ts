import { NextRequest, NextResponse } from 'next/server';
import { listUsersWithoutPasswords, createUser, defaultPermissionsFor, KNOWN_CATALOG_AREAS } from '@/lib/auth';
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
  'Access-Control-Allow-Origin': process.env.ADMIN_ORIGIN || 'http://localhost:3000',
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
      permissions: u.permissions,
      // Campos abaixo só existem quando role === 'cliente' (client vem do
      // Client vinculado, ver clientId) — usados pelo "ver mais"/edição da
      // aba Usuários no admin (UsersApp.js), pra mostrar/editar o cadastro
      // inteiro sem round-trip extra.
      clientId: u.clientId,
      cpfCnpj: client?.cpfCnpj,
      cep: client?.cep,
      street: client?.street,
      number: client?.number,
      complement: client?.complement,
      neighborhood: client?.neighborhood,
      city: client?.city,
      state: client?.state,
      companyResponsible: client?.companyResponsible,
      storeName: client?.storeName,
      clientEmail: client?.email,
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
  // Quais "ferramentas" do catálogo essa vendedora pode ver (ver checkboxes
  // em admin/src/components/usuarios/UserFormModal.js) — filtra pra só
  // aceitar chaves conhecidas (KNOWN_CATALOG_AREAS), sem valor = usa o
  // default do perfil (defaultPermissionsFor).
  const catalogAreas = Array.isArray(body?.catalogAreas)
    ? body.catalogAreas.filter((a: unknown): a is string => KNOWN_CATALOG_AREAS.includes(a as never))
    : undefined;

  if (!name || !email || !password) {
    return NextResponse.json({ error: 'Informe nome, e-mail e senha.' }, { status: 400, headers: CORS_HEADERS });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'A senha precisa ter pelo menos 6 caracteres.' }, { status: 400, headers: CORS_HEADERS });
  }

  try {
    const permissions = { ...defaultPermissionsFor('vendedora'), catalogAreas: catalogAreas ?? defaultPermissionsFor('vendedora').catalogAreas };
    const user = await createUser({ email, password, name, role: 'vendedora', permissions });
    sendSignupConfirmationEmail({ to: user.email, name: user.name });
    return NextResponse.json(user, { status: 201, headers: CORS_HEADERS });
  } catch (err) {
    if (err instanceof Error && err.message === 'EMAIL_TAKEN') {
      return NextResponse.json({ error: 'Já existe uma conta com esse e-mail.' }, { status: 409, headers: CORS_HEADERS });
    }
    throw err;
  }
}
