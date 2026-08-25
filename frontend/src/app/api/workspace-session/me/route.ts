import { NextRequest, NextResponse } from 'next/server';
import { API_BASE } from '@/lib/api-config';

// Usado pelo WorkspaceAuthProvider (client) pra saber quem está logada e
// mostrar nome/perfil + "Sair" no WorkspaceNav.
//
// O tenant é resolvido pelo referer (página atual) — ver nota em
// api/workspace-session/profile/route.ts sobre por que não confiar só no
// cookie ippa_workspace_tenant, compartilhado entre abas.
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

export async function GET(request: NextRequest) {
  const token = request.cookies.get('ippa_workspace_session')?.value;
  const tenant = tenantFromReferer(request) ?? request.cookies.get('ippa_workspace_tenant')?.value;
  if (!token || !tenant) return NextResponse.json(null);
  const res = await fetch(`${API_BASE}/api/${tenant}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) return NextResponse.json(null);
  const payload = await res.json() as { user?: { role?: string } | null };
  if (!payload.user || payload.user.role === 'cliente') return NextResponse.json(null);
  return NextResponse.json(payload.user);
}
