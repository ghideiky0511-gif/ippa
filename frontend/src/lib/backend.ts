import { cookies } from 'next/headers';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || 'http://localhost:3001';

export async function backendRequest(pathname: string, init: RequestInit = {}): Promise<Response> {
  const cookieStore = await cookies();
  const headers = new Headers(init.headers);
  const cookieHeader = cookieStore.toString();
  if (cookieHeader) headers.set('cookie', cookieHeader);

  return fetch(`${BACKEND_URL}${pathname}`, {
    ...init,
    headers,
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
