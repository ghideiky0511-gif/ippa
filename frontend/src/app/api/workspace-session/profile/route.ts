import { NextRequest, NextResponse } from 'next/server';
import { API_BASE } from '@/lib/api-config';

// Mantém o token da sessão do workspace no cookie HttpOnly. A página de
// perfil não precisa conhecer nem manipular esse token.
export async function PATCH(request: NextRequest) {
  const token = request.cookies.get('ippa_workspace_session')?.value;
  const tenant = request.cookies.get('ippa_workspace_tenant')?.value;
  if (!token || !tenant) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 });

  const response = await fetch(`${API_BASE}/api/${tenant}/auth/profile`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  return NextResponse.json(payload, { status: response.status });
}
