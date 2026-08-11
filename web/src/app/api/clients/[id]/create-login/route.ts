import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken, SESSION_COOKIE, createUser, hasLoginForClient } from '@/lib/auth';
import { readClients } from '@/lib/clients';

// Cria login (e-mail+senha) pra um cadastro de cliente que já existe (feito
// pela vendedora dentro do talão) — transforma um "cadastro rápido" (só
// Client, sem AuthUser) numa conta de verdade. Ação administrativa da
// vendedora: NÃO loga esse navegador como a cliente (nenhum cookie setado
// aqui) — a vendedora continua com a própria sessão. Necessário porque
// useTalaoClientGate.ts agora também exige login da cliente antes de
// avançar pro frete/pagamento — combinado com o usuário: se ela só tem
// cadastro rápido, a vendedora cria o login ali mesmo em vez de travar o
// atendimento. Uma vez criado, a cliente já pode entrar sozinha depois
// (mesmo e-mail/senha) e ver o mesmo pedido em tempo real
// (ClientSessionProvider.tsx).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await getUserFromToken(token);
  if (!user || user.role !== 'vendedora') {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const clients = await readClients();
  const client = clients.find((c) => c.id === id);
  if (!client) {
    return NextResponse.json({ error: 'Cadastro não encontrado.' }, { status: 404 });
  }
  if (await hasLoginForClient(id)) {
    return NextResponse.json({ error: 'Essa cliente já tem login.' }, { status: 409 });
  }

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!email || !password) {
    return NextResponse.json({ error: 'Informe e-mail e senha.' }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'A senha precisa ter pelo menos 6 caracteres.' }, { status: 400 });
  }

  try {
    const newUser = await createUser({ email, password, name: client.name, role: 'cliente', clientId: id });
    return NextResponse.json({ user: newUser });
  } catch (err) {
    if (err instanceof Error && err.message === 'EMAIL_TAKEN') {
      return NextResponse.json({ error: 'Já existe uma conta com esse e-mail.' }, { status: 409 });
    }
    throw err;
  }
}
