import {
  ClientLookupResultSchema,
  ClientSyncResultSchema,
  ClientWithLoginSchema,
  ClientsPageSchema,
  UpdateClientProfileInputSchema,
  type ClientLookupResult,
  type ClientSyncResult,
  type ClientWithLogin,
  type ClientsPage,
  type UpdateClientProfileInput,
} from '@/domain/clients/types';
import { adminJson } from './http';

export type { ClientsPage, ClientLookupResult, ClientSyncResult, ClientWithLogin, UpdateClientProfileInput };

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

export function fetchClient(id: string): Promise<ClientWithLogin> {
  return adminJson(`/api/clients/${encodeURIComponent(id)}`, ClientWithLoginSchema, {}, 'Não foi possível carregar a cliente.');
}

export function syncClientFromErp(id: string): Promise<ClientSyncResult> {
  return adminJson(`/api/clients/${encodeURIComponent(id)}/sync-erp`, ClientSyncResultSchema, { method: 'POST' }, 'Não foi possível sincronizar com o ERP.');
}

export async function updateClient(id: string, changes: UpdateClientProfileInput): Promise<ClientWithLogin> {
  const payload = UpdateClientProfileInputSchema.parse(changes);
  return adminJson(`/api/clients/${encodeURIComponent(id)}`, ClientWithLoginSchema, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, 'Não foi possível salvar o cadastro.');
}

