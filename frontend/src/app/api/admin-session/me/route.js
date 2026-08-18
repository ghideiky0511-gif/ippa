import { NextResponse } from 'next/server';

const API_BASE = process.env.BACKEND_INTERNAL_URL || 'http://localhost:3001';

// Usado pelo AdminAuthProvider.js (client) pra saber quem está logada e
// mostrar nome/perfil + "Sair" no AdminNav.
export async function GET(request) {
  const token = request.cookies.get('ippa_admin_session')?.value;
  if (!token) return NextResponse.json(null);
  const res = await fetch(`${API_BASE}/api/admin/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) return NextResponse.json(null);
  const user = await res.json();
  return NextResponse.json(user);
}
