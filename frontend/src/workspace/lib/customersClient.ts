import {
  ClientLookupResultSchema,
  ClientSchema,
  ClientSyncResultSchema,
  ClientWithLoginSchema,
  ClientsPageSchema,
  UpdateClientProfileInputSchema,
  type Client,
  type ClientLookupResult,
  type ClientSyncResult,
  type ClientWithLogin,
  type ClientsPage,
  type UpdateClientProfileInput,
} from '@/domain/clients/types';
import { adminJson } from './http';

export type { ClientsPage, ClientLookupResult, ClientSyncResult, ClientWithLogin, UpdateClientProfileInput };

function clientsPath({ query = '', page = 1, pageSize = 20, sellerId = '' }: { query?: string; page?: number; pageSize?: number; sellerId?: string } = {}) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (query.trim()) params.set('q', query.trim());
  if (sellerId.trim()) params.set('sellerId', sellerId.trim());
  return `/api/admin/clients?${params}`;
}

export function fetchClientsPage(params?: { query?: string; page?: number; pageSize?: number; sellerId?: string }): Promise<ClientsPage> {
  return adminJson(clientsPath(params), ClientsPageSchema, {}, 'Não foi possível carregar os clientes.');
}

// Reatribui a carteira: só troca a vendedora responsável (last_seller_id) --
// endpoint estreito, não reabre o resto do cadastro (ver
// clientService.reassignClientSeller no backend).
export function reassignClientSeller(clientId: string, sellerId: string): Promise<Client> {
  return adminJson(`/api/admin/clients/${encodeURIComponent(clientId)}/seller`, ClientSchema, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sellerId }),
  }, 'Não foi possível reatribuir a carteira desta cliente.');
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

