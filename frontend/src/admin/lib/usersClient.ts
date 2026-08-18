import type { AdminUser, ClientRegistration, UserCredentials } from '@/domain/clients/types';
import { adminJson } from './http';

export function fetchUsers(): Promise<AdminUser[]> {
  return adminJson('/api/admin/users', {}, 'Não foi possível carregar os usuários.');
}

export function createVendedora(credentials: UserCredentials & { password: string }): Promise<AdminUser> {
  return adminJson('/api/admin/users', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials),
  }, 'Não foi possível criar o acesso.');
}

export function updateUser(id: string, credentials: UserCredentials): Promise<AdminUser> {
  return adminJson(`/api/admin/users/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...credentials, password: credentials.password || undefined }),
  }, 'Não foi possível salvar as alterações.');
}

export function deleteUser(id: string): Promise<void> {
  return adminJson(`/api/admin/users/${id}`, { method: 'DELETE' }, 'Não foi possível excluir o usuário.');
}

export function createCliente(fields: ClientRegistration): Promise<AdminUser> {
  return adminJson('/api/admin/clients', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields),
  }, 'Não foi possível criar a cliente.');
}

export function updateClient(clientId: string, fields: Partial<ClientRegistration>): Promise<AdminUser> {
  return adminJson(`/api/admin/clients/${clientId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields),
  }, 'Não foi possível salvar o cadastro.');
}
