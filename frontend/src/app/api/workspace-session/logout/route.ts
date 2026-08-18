import { NextRequest, NextResponse } from 'next/server';
import { API_BASE } from '@/lib/api-config';

export async function POST(request: NextRequest) {
  const token = request.cookies.get('ippa_workspace_session')?.value;
  const tenant = request.cookies.get('ippa_workspace_tenant')?.value;
  if (token && tenant) {
    await fetch(`${API_BASE}/api/${tenant}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set('ippa_workspace_session', '', { path: '/', maxAge: 0 });
  response.cookies.set('ippa_workspace_tenant', '', { path: '/', maxAge: 0 });
  return response;
}
