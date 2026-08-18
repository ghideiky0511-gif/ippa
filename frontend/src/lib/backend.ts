import { cookies, headers } from 'next/headers';
import { getBackendUrl } from '@/lib/api-config';

const BACKEND_URL = getBackendUrl();

export async function backendRequest(pathname: string, init: RequestInit = {}): Promise<Response> {
  const cookieStore = await cookies();
  const incomingHeaders = await headers();
  const outgoingHeaders = new Headers(init.headers);
  const cookieHeader = cookieStore.toString();
  if (cookieHeader) outgoingHeaders.set('cookie', cookieHeader);
  const tenantSlug = incomingHeaders.get('x-ippa-tenant');
  if (!tenantSlug) throw new Error('A página precisa ser acessada por /{tenant_slug}/.');

  return fetch(`${BACKEND_URL}/api/${tenantSlug}${pathname.replace(/^\/api/, '')}`, {
    ...init,
    headers: outgoingHeaders,
    cache: init.cache ?? 'no-store',
  });
}

export async function backendJson<T>(pathname: string, init: RequestInit = {}): Promise<T> {
  const response = await backendRequest(pathname, init);
  if (!response.ok) {
    throw new Error(`Backend respondeu ${response.status} para ${pathname}.`);
  }
  return response.json() as Promise<T>;
}
