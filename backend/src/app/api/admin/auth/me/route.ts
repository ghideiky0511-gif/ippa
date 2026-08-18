import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';

// "Quem sou eu" da sessão do admin — usado pelo proxy do admin
// (admin/src/proxy.js, valida a cada navegação) e pelo
// admin/src/app/api/auth/me/route.js (exibe nome/perfil no AdminNav).
// Token vem por Authorization: Bearer, nunca por cookie (a cookie de
// sessão do admin é da ORIGEM do admin, este endpoint é chamado
// servidor-a-servidor).
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.ADMIN_ORIGIN || 'http://localhost:3010',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = await getUserFromToken(token);
  if (!user || !user.permissions?.adminAccess) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401, headers: CORS_HEADERS });
  }
  return NextResponse.json(user, { headers: CORS_HEADERS });
}
