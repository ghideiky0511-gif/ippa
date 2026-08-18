import { NextResponse } from 'next/server';

const API_BASE = process.env.BACKEND_INTERNAL_URL || 'http://localhost:3001';

// Proxy fino pro login de verdade (POST /api/admin/auth/login em `web` —
// é lá que users.json/authSessions.json moram). Sucesso vira cookie
// própria desta origem (ippa_admin_session); o token nunca chega no
// navegador solto.
export async function POST(request) {
  const body = await request.json().catch(() => null);
  const res = await fetch(`${API_BASE}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json({ error: data.error || 'Não foi possível entrar.' }, { status: res.status });
  }

  const response = NextResponse.json({ user: data.user });
  response.cookies.set('ippa_admin_session', data.token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
