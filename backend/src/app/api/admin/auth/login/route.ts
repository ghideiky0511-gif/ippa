import { NextRequest, NextResponse } from 'next/server';
import { verifyLogin, createSessionToken } from '@/lib/auth';

// Login da plataforma admin — só quem tem permissions.adminAccess (ver
// AuthUser em types.ts) consegue, independente do role. Chamado pelo
// proxy do próprio admin (admin/src/app/api/auth/login/route.js), nunca
// direto pelo navegador — por isso devolve o token no corpo em vez de
// setar cookie aqui: quem seta a cookie é o admin, na PRÓPRIA origem dele
// (admin/porta 3001 em dev, subdomínio próprio em produção — cookie desta
// origem não chegaria lá).
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.ADMIN_ORIGIN || 'http://localhost:3000',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!email || !password) {
    return NextResponse.json({ error: 'Informe e-mail e senha.' }, { status: 400, headers: CORS_HEADERS });
  }

  const user = await verifyLogin(email, password);
  if (!user || !user.permissions?.adminAccess) {
    return NextResponse.json({ error: 'E-mail, senha ou permissão de acesso inválidos.' }, { status: 401, headers: CORS_HEADERS });
  }

  const token = await createSessionToken(user.id);
  return NextResponse.json({ token, user }, { headers: CORS_HEADERS });
}
