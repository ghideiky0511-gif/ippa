const DEFAULT_BACKEND_URL = 'http://localhost:3011';

/**
 * Endereço usado pelo frontend no servidor para acessar o backend diretamente.
 * No Docker, BACKEND_INTERNAL_URL aponta para o nome do serviço (`backend`).
 * No Render, BACKEND_INTERNAL_HOST/PORT são resolvidos automaticamente pelo
 * Blueprint (render.yaml) via `fromService`, então não precisam ser digitados
 * manualmente no painel.
 */
export function getBackendUrl(): string {
  const host = process.env.BACKEND_INTERNAL_HOST;
  const port = process.env.BACKEND_INTERNAL_PORT;
  const url = host && port ? `http://${host}:${port}` : process.env.BACKEND_INTERNAL_URL || DEFAULT_BACKEND_URL;
  return url.replace(/\/+$/, '');
}

/**
 * No navegador, usa caminho relativo para que /api passe pelo proxy do Next.js.
 * No servidor, usa a URL interna do backend para evitar uma volta pela rede pública.
 */
export const API_BASE = typeof window === 'undefined' ? getBackendUrl() : '';

/**
 * Assina uma chamada de servidor confiável (SSR ou proxy) para o backend
 * isentá-la do rate limit por IP. No Render, todo o tráfego SSR sai de poucos
 * IPs de egress compartilhados; sem essa marca uma única page view (vários
 * GETs + prefetch) estoura o limite (429). Vazio em dev local — não faz nada.
 */
export function applyInternalRequestHeader(headers: Headers): void {
  const token = process.env.INTERNAL_REQUEST_TOKEN;
  if (token) headers.set('x-ippa-internal', token);
}
