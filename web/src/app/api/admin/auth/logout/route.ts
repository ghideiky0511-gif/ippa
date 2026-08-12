import { NextRequest, NextResponse } from 'next/server';
import { destroySessionToken } from '@/lib/auth';

// Derruba a sessão no servidor quando o admin sai — chamado pelo proxy do
// admin (admin/src/app/api/auth/logout/route.js), mesmo padrão de token
// via Authorization do login/me acima.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.ADMIN_ORIGIN || 'http://localhost:3001',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token) await destroySessionToken(token);
  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
}
