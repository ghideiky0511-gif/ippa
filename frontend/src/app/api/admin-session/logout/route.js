import { NextResponse } from 'next/server';

const API_BASE = process.env.BACKEND_INTERNAL_URL || 'http://localhost:3001';

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
