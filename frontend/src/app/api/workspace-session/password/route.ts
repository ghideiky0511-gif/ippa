import { NextRequest, NextResponse } from 'next/server';
import { API_BASE } from '@/lib/api-config';

// Mesma resolução de tenant usada em api/workspace-session/profile/route.ts —
// ver o comentário lá para o porquê de preferir o referer ao cookie
// ippa_workspace_tenant.
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

  const response = await fetch(`${API_BASE}/api/${tenant}/auth/profile/password`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  // A troca de senha revoga todas as sessões da conta (inclusive a atual),
  // então o cookie de sessão local também precisa ser limpo em caso de sucesso.
  if (response.status === 204) {
    const cleared = new NextResponse(null, { status: 204 });
    cleared.cookies.delete('ippa_workspace_session');
    cleared.cookies.delete('ippa_workspace_tenant');
    return cleared;
  }
  const payload = await response.json().catch(() => ({}));
  return NextResponse.json(payload, { status: response.status });
}
