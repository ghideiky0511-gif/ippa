import type { AdminUser } from '@/domain/clients/types';
import { adminJsonServer } from './httpServer';

export function fetchUsers(): Promise<AdminUser[]> {
  return adminJsonServer('/api/admin/users', {}, 'Não foi possível carregar os usuários.');
}
