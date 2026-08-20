import type { Client } from '@/domain/clients/types';
import { adminJson } from './http';

export interface ClientsPage {
  clients: Client[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  kpis: { newThisMonth: number; withEmail: number; withAddress: number };
}

function clientsPath({ query = '', page = 1, pageSize = 20 }: { query?: string; page?: number; pageSize?: number } = {}) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (query.trim()) params.set('q', query.trim());
  return `/api/admin/clients?${params}`;
}

export function fetchClientsPage(params?: { query?: string; page?: number; pageSize?: number }): Promise<ClientsPage> {
  return adminJson(clientsPath(params), {}, 'Não foi possível carregar os clientes.');
}

export function addClientByDocument(document: string): Promise<{ client: Client | null; source: 'local' | 'erp' | 'not_found' }> {
  return adminJson(`/api/clients/lookup?document=${encodeURIComponent(document)}`, {}, 'Não foi possível localizar a cliente pelo documento.');
}
