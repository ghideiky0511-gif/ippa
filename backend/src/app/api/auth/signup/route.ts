import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createUser, createSessionToken, SESSION_COOKIE, getOnlineVendedoraIds } from '@/lib/auth';
import { readClients, writeClients, findClientByDocument } from '@/lib/clients';
import { readOrderSessions, writeOrderSessions, countOpenSessionsBySeller } from '@/lib/orderSessions';
import { pickSeller } from '@/lib/assignment';
import { readStoreSettings } from '@/lib/storeSettings';
import { notifySession } from '@/lib/sseHub';
import { sendSignupConfirmationEmail } from '@/lib/email';
import type { CartItem, Client, OrderSession } from '@/lib/types';

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
  // Carrinho anônimo (localStorage) que a pessoa já tinha montado antes de
  // ser obrigada a criar conta (ver gate de login em /frete e /pagamento,
  // web/src/app/cadastro/page.tsx manda o cart atual junto) — só usado
  // abaixo se o gatilho de fila criar uma sessão nova pra ela.
  const anonymousCart: CartItem[] = Array.isArray(body?.cart) ? body.cart : [];

  if (!name || !email || !password || !cpfCnpj || !cep || !street || !number || !neighborhood || !city || !state) {
    return NextResponse.json(
      { error: 'Preencha nome, e-mail, senha, CPF/CNPJ, CEP, Rua, Número, Bairro, Cidade e Estado.' },
      { status: 400 }
    );
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'A senha precisa ter pelo menos 6 caracteres.' }, { status: 400 });
  }

  const existingClients = await readClients();
  if (findClientByDocument(existingClients, cpfCnpj)) {
    return NextResponse.json({ error: 'Já existe um cadastro com esse CPF/CNPJ.' }, { status: 409 });
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

  // Fire-and-forget — não atrasa nem quebra o cadastro se o e-mail falhar
  // (ver sendEmail em web/src/lib/email.ts, já captura erro sozinho).
  sendSignupConfirmationEmail({ to: user.email, name: user.name });

  // Gatilho de fila: primeiro cadastro já cai numa vendedora, segundo a
  // estratégia da loja (storeSettings.json `assignmentStrategy`, ver
  // pickSeller em web/src/lib/assignment.ts). Sem vendedora online agora,
  // não cria sessão nenhuma — OrderSession.sellerId é obrigatório, não dá
  // pra criar "sem dono"; a cliente segue com o carrinho pessoal de hoje, e
  // uma vendedora pode achá-la depois pela busca por nome/CPF no talão
  // (mesmo caminho já usado pra cadastro criado manualmente).
  const [onlineSellerIds, openCountBySeller, settings] = await Promise.all([
    getOnlineVendedoraIds(),
    countOpenSessionsBySeller(),
    readStoreSettings(),
  ]);
  const sellerId = pickSeller(onlineSellerIds, openCountBySeller, settings.assignmentStrategy);
  if (sellerId) {
    const now2 = new Date().toISOString();
    const session: OrderSession = {
      id: randomUUID(),
      clientName: client.name,
      clientId: client.id,
      sellerId,
      channel: 'online',
      // Sessão nasce com o carrinho que ela já tinha montado sem login, em
      // vez de vazia — sem isso o carrinho "sumiria" bem na hora em que ela
      // é obrigada a logar pra continuar (effectiveCart passa a vir da
      // sessão, ver CartProvider.tsx).
      items: anonymousCart,
      status: 'aberto',
      createdAt: now2,
      updatedAt: now2,
    };
    const sessions = await readOrderSessions();
    sessions.push(session);
    await writeOrderSessions(sessions);

    const clientIndex = clients.findIndex((c) => c.id === client.id);
    if (clientIndex !== -1) {
      clients[clientIndex] = { ...clients[clientIndex], lastSellerId: sellerId, updatedAt: now2 };
      await writeClients(clients);
    }

    notifySession(session);
  }

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
