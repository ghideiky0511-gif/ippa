import { cookies, headers } from 'next/headers';
import type { z } from 'zod';
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

// `schema` valida a resposta em runtime (não só documenta o tipo) — uma
// resposta fora do formato esperado lança em vez de propagar campos
// undefined/errados pro componente. Ver plano de validação Zod na
// fronteira da API.
export async function backendJson<S extends z.ZodTypeAny>(
  pathname: string,
  schema: S,
  init: RequestInit = {},
): Promise<z.infer<S>> {
  const response = await backendRequest(pathname, init);
  if (!response.ok) {
    throw new Error(`Backend respondeu ${response.status} para ${pathname}.`);
  }
  const json = await response.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw Object.assign(
      new Error(`Resposta inválida do backend para ${pathname}.`),
      { details: parsed.error.issues },
    );
  }
  return parsed.data;
}
