import { NextRequest, NextResponse } from 'next/server';
import { API_BASE } from '@/lib/api-config';

// Mantém o token da sessão do workspace no cookie HttpOnly. A página de
// perfil não precisa conhecer nem manipular esse token.
//
// O tenant é resolvido pelo referer (página atual), não só pelo cookie
// ippa_workspace_tenant: esse cookie é compartilhado entre abas, então uma
// aba aberta no tenant A pode ver seu valor sobrescrito por um login feito
// em outra aba no tenant B. Como as sessões são isoladas por tenant via RLS,
// validar o token sob o tenant errado derruba a sessão com 401 mesmo sendo
// válida — usar o referer mantém a resolução coerente com o middleware
// (proxy.ts), que sempre deriva o tenant da URL atual.
function tenantFromReferer(request: NextRequest): string | null {
  const referer = request.headers.get('referer');
  if (!referer) return null;
  try {
    const first = new URL(referer).pathname.split('/')[1]?.toLowerCase();
    return first && /^[a-z0-9][a-z0-9-]{1,62}$/.test(first) ? first : null;
  } catch {
    return null;
  }
}

function resolveTenant(request: NextRequest): string | undefined {
  return tenantFromReferer(request) ?? request.cookies.get('ippa_workspace_tenant')?.value;
}

export async function PATCH(request: NextRequest) {
  const token = request.cookies.get('ippa_workspace_session')?.value;
  const tenant = resolveTenant(request);
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

export async function POST(request: NextRequest) {
  const token = request.cookies.get('ippa_workspace_session')?.value;
  const tenant = resolveTenant(request);
  if (!token || !tenant) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const body = await request.formData().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Envie o arquivo do avatar.' }, { status: 400 });
  const response = await fetch(`${API_BASE}/api/${tenant}/auth/profile/avatar`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body, cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  return NextResponse.json(payload, { status: response.status });
}

export async function DELETE(request: NextRequest) {
  const token = request.cookies.get('ippa_workspace_session')?.value;
  const tenant = resolveTenant(request);
  if (!token || !tenant) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const response = await fetch(`${API_BASE}/api/${tenant}/auth/profile/avatar`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  return NextResponse.json(payload, { status: response.status });
}
