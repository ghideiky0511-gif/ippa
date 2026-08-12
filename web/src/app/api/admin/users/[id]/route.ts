import { NextRequest, NextResponse } from 'next/server';
import { deleteUser, updateUser, KNOWN_CATALOG_AREAS } from '@/lib/auth';
import { deleteClient } from '@/lib/clients';

// Exclui uma conta pela aba "Usuários" do admin (ver GET/POST em
// ../route.ts). Vendedora: só apaga o login. Cliente: apaga o login E o
// cadastro (Client) vinculado — não deixa órfão. Pedidos/sessões antigas
// dessa pessoa (orderHistory.json/orderSessions.json) NÃO são apagados —
// são histórico, ficam com o clientId/sellerId "solto" apontando pra
// ninguém, igual qualquer sistema de pedidos que mantém a venda mesmo
// depois da conta sair.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.ADMIN_ORIGIN || 'http://localhost:3001',
  'Access-Control-Allow-Methods': 'DELETE, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// Edita nome/e-mail/senha do LOGIN (vale pra vendedora e pra cliente — a
// cliente também tem cadastro (Client) editável separadamente, ver PUT
// /api/admin/clients/[id]). Senha em branco = mantém a atual.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : undefined;
  const email = typeof body?.email === 'string' ? body.email.trim() : undefined;
  const password = typeof body?.password === 'string' ? body.password : undefined;
  const catalogAreas = Array.isArray(body?.catalogAreas)
    ? body.catalogAreas.filter((a: unknown): a is string => KNOWN_CATALOG_AREAS.includes(a as never))
    : undefined;

  if (password && password.length < 6) {
    return NextResponse.json({ error: 'A senha precisa ter pelo menos 6 caracteres.' }, { status: 400, headers: CORS_HEADERS });
  }

  try {
    const updated = await updateUser(id, { name, email, password, catalogAreas });
    if (!updated) {
      return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404, headers: CORS_HEADERS });
    }
    return NextResponse.json(updated, { headers: CORS_HEADERS });
  } catch (err) {
    if (err instanceof Error && err.message === 'EMAIL_TAKEN') {
      return NextResponse.json({ error: 'Já existe uma conta com esse e-mail.' }, { status: 409, headers: CORS_HEADERS });
    }
    throw err;
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const removed = await deleteUser(id);
  if (!removed) {
    return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404, headers: CORS_HEADERS });
  }
  if (removed.role === 'cliente' && removed.clientId) {
    await deleteClient(removed.clientId);
  }
  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
}
