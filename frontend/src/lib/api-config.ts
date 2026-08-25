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
