const DEFAULT_PUBLIC_BACKEND_URL = 'http://localhost:3011';

function backendUrl(): string {
  return (process.env.NEXT_PUBLIC_BACKEND_URL || DEFAULT_PUBLIC_BACKEND_URL).replace(/\/+$/, '');
}

function tenantFromBrowserPath(): string {
  const slug = window.location.pathname.split('/')[1]?.toLowerCase();
  if (!slug || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) {
    throw new Error('A API do tenant exige uma URL iniciada por /{tenant_slug}/.');
  }
  return slug;
}

export function apiUrl(path: string): string {
  if (!path.startsWith('/api/')) throw new Error(`Caminho de API inválido: ${path}`);
  if (path.startsWith('/api/control/')) return `${backendUrl()}${path}`;
  return `${backendUrl()}/api/${tenantFromBrowserPath()}${path.slice(4)}`;
}

export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(apiUrl(path), { ...init, credentials: init.credentials ?? 'include' });
}

export function apiEventSource(path: string): EventSource {
  return new EventSource(apiUrl(path), { withCredentials: true });
}
