import { NextRequest, NextResponse } from 'next/server';
import { API_BASE } from '@/lib/api-config';

// Usado pelo WorkspaceAuthProvider (client) pra saber quem está logada e
// mostrar nome/perfil + "Sair" no WorkspaceNav.
export async function GET(request: NextRequest) {
  const token = request.cookies.get('ippa_workspace_session')?.value;
  const tenant = request.cookies.get('ippa_workspace_tenant')?.value;
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
