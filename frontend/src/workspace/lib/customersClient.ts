import {
  ClientLookupResultSchema,
  ClientsPageSchema,
  type ClientLookupResult,
  type ClientsPage,
} from '@/domain/clients/types';
import { adminJson } from './http';

export type { ClientsPage, ClientLookupResult };

function clientsPath({ query = '', page = 1, pageSize = 20 }: { query?: string; page?: number; pageSize?: number } = {}) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (query.trim()) params.set('q', query.trim());
  return `/api/admin/clients?${params}`;
}

export function fetchClientsPage(params?: { query?: string; page?: number; pageSize?: number }): Promise<ClientsPage> {
  return adminJson(clientsPath(params), ClientsPageSchema, {}, 'Não foi possível carregar os clientes.');
}

export function addClientByDocument(document: string): Promise<ClientLookupResult> {
  return adminJson(`/api/clients/lookup?document=${encodeURIComponent(document)}`, ClientLookupResultSchema, {}, 'Não foi possível localizar a cliente pelo documento.');
}
