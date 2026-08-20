import { apiFetch } from '@/lib/api-client';

interface ApiErrorPayload {
  error?: string;
}

export async function adminJson<T>(path: string, init: RequestInit = {}, fallbackError: string): Promise<T> {
  const response = await apiFetch(path, { cache: 'no-store', ...init });
  const payload = await response.json().catch(() => null) as T | ApiErrorPayload | null;

  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload ? payload.error : undefined;
    throw new Error(message || fallbackError);
  }

  return payload as T;
}
