import { NextResponse } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_CATALOG_ORIGIN || 'http://localhost:3000';

export async function POST(request) {
  const token = request.cookies.get('ippa_admin_session')?.value;
  if (token) {
    await fetch(`${API_BASE}/api/admin/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set('ippa_admin_session', '', { path: '/', maxAge: 0 });
  return response;
}
