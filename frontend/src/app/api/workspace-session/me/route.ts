import { NextRequest, NextResponse } from 'next/server';
import { API_BASE } from '@/lib/api-config';

// Usado pelo WorkspaceAuthProvider (client) pra saber quem está logada e
// mostrar nome/perfil + "Sair" no WorkspaceNav.
export async function GET(request: NextRequest) {
  const token = request.cookies.get('ippa_admin_session')?.value;
  const tenant = request.cookies.get('ippa_admin_tenant')?.value;
  if (!token || !tenant) return NextResponse.json(null);
  const res = await fetch(`${API_BASE}/api/${tenant}/admin/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) return NextResponse.json(null);
  const user = await res.json();
  return NextResponse.json(user);
}
