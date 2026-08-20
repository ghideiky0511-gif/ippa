import { adminJsonServer } from './httpServer';
import type { ClientsPage } from './customersClient';

function clientsPath({ query = '', page = 1, pageSize = 20 }: { query?: string; page?: number; pageSize?: number } = {}) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (query.trim()) params.set('q', query.trim());
  return `/api/admin/clients?${params}`;
}

export function fetchClients(params?: { query?: string; page?: number; pageSize?: number }): Promise<ClientsPage> {
  return adminJsonServer(clientsPath(params), {}, 'Não foi possível carregar os clientes.');
}
