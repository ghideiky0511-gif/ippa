import { NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '@/lib/api-config';
import type { AuthUser } from '@/domain/clients/types';

const BACKEND_URL = getBackendUrl();
const CUSTOMER_PUBLIC_PREFIXES = ['/login', '/cadastro', '/pagar', '/em-construcao'];

function catalogAreaForPath(pathname: string): string {
  return pathname.startsWith('/pedidos') ? 'pedidos' : 'talao';
}

function tenantFromPath(pathname: string): string | null {
  const first = pathname.split('/')[1]?.toLowerCase();
  return first && /^[a-z0-9][a-z0-9-]{1,62}$/.test(first) ? first : null;
}

function tenantFromReferer(request: NextRequest): string | null {
  const referer = request.headers.get('referer');
  if (!referer) return null;
  try { return tenantFromPath(new URL(referer).pathname); } catch { return null; }
}

async function validateAdmin(request: NextRequest, tenantSlug: string): Promise<boolean> {
  const token = request.cookies.get('ippa_admin_session')?.value;
  if (!token) return false;

  try {
    const response = await fetch(`${BACKEND_URL}/api/${tenantSlug}/admin/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function validateControl(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get('ippa_control_session')?.value;
  if (!token) return false;
  try {
    const response = await fetch(`${BACKEND_URL}/api/control/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function getCustomer(request: NextRequest, tenantSlug: string): Promise<AuthUser | null> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/${tenantSlug}/auth/me`, {
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
  if (pathname.startsWith('/_next') || pathname === '/favicon.ico') return NextResponse.next();

  if (pathname.startsWith('/api/control-session/')) return NextResponse.next();

  if (pathname === '/control' || pathname.startsWith('/control/')) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-ippa-control', '1');
    if (pathname === '/control/login' || pathname.startsWith('/control/login/')) {
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    return await validateControl(request)
      ? NextResponse.next({ request: { headers: requestHeaders } })
      : NextResponse.redirect(new URL('/control/login', request.url));
  }

  const slugFromPath = tenantFromPath(pathname);

  // Chamadas do navegador continuam usando /api por compatibilidade; o slug
  // vem da página de origem e é convertido antes de alcançar o backend.
  if (pathname.startsWith('/api/')) {
    if (pathname.startsWith('/api/admin-session/')) return NextResponse.next();
    const tenantSlug = tenantFromReferer(request);
    if (!tenantSlug) return NextResponse.json({ error: 'Tenant ausente.' }, { status: 404 });
    return NextResponse.rewrite(new URL(`${BACKEND_URL}/api/${tenantSlug}${pathname.slice(4)}`, request.url));
  }

  if (!slugFromPath) return NextResponse.redirect(new URL('/demo/', request.url));
  const tenantPrefix = `/${slugFromPath}`;
  const tenantPath = pathname.slice(tenantPrefix.length) || '/';

  if (tenantPath.startsWith('/api/')) {
    return NextResponse.rewrite(new URL(`${BACKEND_URL}/api/${slugFromPath}${tenantPath.slice(4)}`, request.url));
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-ippa-tenant', slugFromPath);

  if (tenantPath.startsWith('/admin')) {
    if (tenantPath.startsWith('/admin/login')) return NextResponse.rewrite(new URL('/admin/login', request.url), { request: { headers: requestHeaders } });
    const authenticated = await validateAdmin(request, slugFromPath);
    return authenticated
      ? NextResponse.rewrite(new URL(tenantPath, request.url), { request: { headers: requestHeaders } })
      : NextResponse.redirect(new URL(`${tenantPrefix}/admin/login`, request.url));
  }

  if (
    CUSTOMER_PUBLIC_PREFIXES.some((prefix) => tenantPath.startsWith(prefix)) ||
    tenantPath.startsWith('/_next') ||
    tenantPath === '/favicon.ico'
  ) {
    return NextResponse.rewrite(new URL(tenantPath, request.url), { request: { headers: requestHeaders } });
  }

  const user = await getCustomer(request, slugFromPath);
  if (!user || user.role === 'vendedora' || user.role === 'cliente') {
    return NextResponse.rewrite(new URL(tenantPath, request.url), { request: { headers: requestHeaders } });
  }

  const allowed = user.permissions?.catalogAreas?.includes(catalogAreaForPath(tenantPath));
  return allowed
    ? NextResponse.rewrite(new URL(tenantPath, request.url), { request: { headers: requestHeaders } })
    : NextResponse.redirect(new URL(`${tenantPrefix}/em-construcao`, request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
