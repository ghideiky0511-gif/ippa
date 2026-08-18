import { NextRequest, NextResponse } from 'next/server';
import { API_BASE } from '@/lib/api-config';

const COOKIE_NAME = 'ippa_control_session';

async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (contentType) headers.set('content-type', contentType);
  if (token) headers.set('authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE}/api/control/${path.join('/')}`, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text(),
    cache: 'no-store',
  });
  const payload = await response.text();
  const result = new NextResponse(payload, {
    status: response.status,
    headers: response.headers.get('content-type') ? { 'content-type': response.headers.get('content-type')! } : undefined,
  });

  if (path.join('/') === 'auth/login' && response.ok) {
    const token = (JSON.parse(payload) as { token?: string }).token;
    if (token) result.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
      secure: process.env.NODE_ENV === 'production',
    });
  }
  if (path.join('/') === 'auth/logout') result.cookies.delete(COOKIE_NAME);
  return result;
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
