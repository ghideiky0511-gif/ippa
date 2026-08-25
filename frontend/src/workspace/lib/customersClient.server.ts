import { ClientWithLoginSchema, ClientsPageSchema, type ClientWithLogin, type ClientsPage } from '@/domain/clients/types';
import { adminJsonServer } from './httpServer';

function clientsPath({ query = '', page = 1, pageSize = 20 }: { query?: string; page?: number; pageSize?: number } = {}) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (query.trim()) params.set('q', query.trim());
  return `/api/admin/clients?${params}`;
}

export function fetchClients(params?: { query?: string; page?: number; pageSize?: number }): Promise<ClientsPage> {
  return adminJsonServer(clientsPath(params), ClientsPageSchema, {}, 'Não foi possível carregar os clientes.');
}

export function fetchClient(id: string): Promise<ClientWithLogin> {
  return adminJsonServer(`/api/clients/${encodeURIComponent(id)}`, ClientWithLoginSchema, {}, 'Não foi possível carregar a cliente.');
}
