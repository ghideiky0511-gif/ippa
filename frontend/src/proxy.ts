import { NextRequest, NextResponse } from 'next/server';
import type { AuthUser } from '@/lib/types';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || 'http://localhost:3001';
const CUSTOMER_PUBLIC_PREFIXES = ['/login', '/cadastro', '/pagar', '/em-construcao'];

function catalogAreaForPath(pathname: string): string {
  return pathname.startsWith('/pedidos') ? 'pedidos' : 'talao';
}

async function validateAdmin(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get('ippa_admin_session')?.value;
  if (!token) return false;

  try {
    const response = await fetch(`${BACKEND_URL}/api/admin/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function getCustomer(request: NextRequest): Promise<AuthUser | null> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/auth/me`, {
      headers: { cookie: request.headers.get('cookie') || '' },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const payload = await response.json() as { user: AuthUser | null };
    return payload.user;
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/admin')) {
    if (pathname.startsWith('/admin/login')) return NextResponse.next();
    const authenticated = await validateAdmin(request);
    return authenticated
      ? NextResponse.next()
      : NextResponse.redirect(new URL('/admin/login', request.url));
  }

  if (
    CUSTOMER_PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  const user = await getCustomer(request);
  if (!user || user.role === 'vendedora' || user.role === 'cliente') {
    return NextResponse.next();
  }

  const allowed = user.permissions?.catalogAreas?.includes(catalogAreaForPath(pathname));
  return allowed
    ? NextResponse.next()
    : NextResponse.redirect(new URL('/em-construcao', request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
