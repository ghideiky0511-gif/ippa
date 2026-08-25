export function apiUrl(path: string): string {
  if (!path.startsWith('/api/')) throw new Error(`Caminho de API inválido: ${path}`);
  return path;
}

export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(apiUrl(path), { ...init, credentials: init.credentials ?? 'include' });
}
