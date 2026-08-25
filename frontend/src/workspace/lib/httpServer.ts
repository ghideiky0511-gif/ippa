import type { z } from 'zod';
import { backendRequest } from '@/lib/backend';

interface ApiErrorPayload {
  error?: string;
  details?: unknown;
}

// Só para uso em Server Components (page.tsx). O fetch no servidor vai direto
// ao backend e não passa pelo proxy.ts, então o slug do tenant precisa vir do
// header x-ippa-tenant (ver lib/backend.ts) em vez do Referer usado pelo
// proxy no navegador. Fica em arquivo separado de http.ts para não puxar
// next/headers para o bundle dos componentes client (*App.tsx) que também
// importam os *Client.ts deste diretório.
//
// `schema` valida a resposta em runtime — ver frontend/src/workspace/lib/http.ts
// (mesma convenção, versão server-side deste helper).
export async function adminJsonServer<S extends z.ZodTypeAny>(
  path: string,
  schema: S,
  init: RequestInit = {},
  fallbackError: string,
): Promise<z.infer<S>> {
  const response = await backendRequest(path, init);
  const payload = await response.json().catch(() => null) as unknown;

  if (!response.ok) {
    const errorPayload = payload as ApiErrorPayload | null;
    const message = errorPayload && typeof errorPayload === 'object' ? errorPayload.error : undefined;
    throw Object.assign(new Error(message || fallbackError), { details: errorPayload?.details });
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw Object.assign(new Error(fallbackError), { details: parsed.error.issues });
  }
  return parsed.data;
}
