import type { Client } from '@/domain/clients/types';
import { adminJsonServer } from './httpServer';

export function fetchClients(): Promise<Client[]> {
  return adminJsonServer('/api/admin/clients', {}, 'Não foi possível carregar os clientes.');
}
