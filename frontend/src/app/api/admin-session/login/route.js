import { NextResponse } from 'next/server';
import { API_BASE } from '@/lib/api-config';

// Proxy fino para o login no backend. Em caso de sucesso, cria um cookie
// próprio desta origem (ippa_admin_session); o token nunca fica exposto
// diretamente no navegador.
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
