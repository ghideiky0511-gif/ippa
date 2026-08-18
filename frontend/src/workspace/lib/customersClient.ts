import type { Client } from '@/domain/clients/types';
import { adminJson } from './http';

export function fetchClients(): Promise<Client[]> {
  return adminJson('/api/admin/clients', {}, 'Não foi possível carregar os clientes.');
}
