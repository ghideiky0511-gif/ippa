import type { z } from 'zod';
import { apiFetch } from '@/lib/api-client';

interface ApiErrorPayload {
  error?: string;
  details?: unknown;
}

// `schema` valida a resposta em runtime — ver frontend/src/lib/backend.ts
// (mesma convenção, versão client-side deste helper).
export async function adminJson<S extends z.ZodTypeAny>(
  path: string,
  schema: S,
  init: RequestInit = {},
  fallbackError: string,
): Promise<z.infer<S>> {
  const response = await apiFetch(path, { cache: 'no-store', ...init });
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
