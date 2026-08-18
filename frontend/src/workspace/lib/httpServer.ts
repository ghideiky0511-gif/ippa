import { backendRequest } from '@/lib/backend';

interface ApiErrorPayload {
  error?: string;
}

// Só para uso em Server Components (page.tsx). O fetch no servidor vai direto
// ao backend e não passa pelo proxy.ts, então o slug do tenant precisa vir do
// header x-ippa-tenant (ver lib/backend.ts) em vez do Referer usado pelo
// proxy no navegador. Fica em arquivo separado de http.ts para não puxar
// next/headers para o bundle dos componentes client (*App.tsx) que também
// importam os *Client.ts deste diretório.
export async function adminJsonServer<T>(path: string, init: RequestInit = {}, fallbackError: string): Promise<T> {
  const response = await backendRequest(path, init);
  const payload = await response.json().catch(() => null) as T | ApiErrorPayload | null;

  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload ? payload.error : undefined;
    throw new Error(message || fallbackError);
  }

  return payload as T;
}
