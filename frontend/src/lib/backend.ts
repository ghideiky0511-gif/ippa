import { cookies, headers } from 'next/headers';
import type { z } from 'zod';
import { getBackendUrl, applyInternalRequestHeader } from '@/lib/api-config';
import { forwardClientIpHeaders } from '@/lib/forwarded-client';

const BACKEND_URL = getBackendUrl();
const RETRYABLE_STARTUP_STATUSES = new Set([404, 502, 503, 504]);
const STARTUP_RETRY_DELAYS_MS = [500, 1_000, 2_000, 4_000];

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function backendRequest(pathname: string, init: RequestInit = {}): Promise<Response> {
  const cookieStore = await cookies();
  const incomingHeaders = await headers();
  const outgoingHeaders = new Headers(init.headers);
  forwardClientIpHeaders(incomingHeaders, outgoingHeaders);
  applyInternalRequestHeader(outgoingHeaders);
  const cookieHeader = cookieStore.toString();
  if (cookieHeader) outgoingHeaders.set('cookie', cookieHeader);
  const tenantSlug = incomingHeaders.get('x-ippa-tenant');
  if (!tenantSlug) throw new Error('A página precisa ser acessada por /{tenant_slug}/.');

  // `no-store` só entra como padrão quando ninguém pediu cache explícito —
  // um chamador que passou `next: { revalidate, tags }` quer participar do
  // Data Cache, e `cache: 'no-store'` junto com `next.revalidate` é uma
  // combinação inválida pro Next (a opção é ignorada com warning).
  const cache = init.cache ?? (init.next ? undefined : 'no-store');
  return fetch(`${BACKEND_URL}/api/${tenantSlug}${pathname.replace(/^\/api/, '')}`, {
    ...init,
    headers: outgoingHeaders,
    cache,
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
  // Durante um deploy/cold start do Render, o domínio público do backend pode
  // responder 404/5xx por alguns segundos antes de o processo Next assumir a
  // rota. O 404 também é incluído por ser a resposta transitória observada no
  // proxy do Render; os demais 4xx continuam falhando imediatamente.
  let response = await backendRequest(pathname, init);
  for (const delay of STARTUP_RETRY_DELAYS_MS) {
    if (!RETRYABLE_STARTUP_STATUSES.has(response.status)) break;
    await wait(delay);
    response = await backendRequest(pathname, init);
  }
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
