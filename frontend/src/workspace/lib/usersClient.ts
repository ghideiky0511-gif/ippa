import { z } from 'zod';
import {
  AdminUserSchema,
  ClientSchema,
  ClientRegistrationSchema,
  CreateUserCredentialsSchema,
  UpdateClientProfileInputSchema,
  UpdateTenantUserInputSchema,
  type AdminUser,
  type Client,
  type ClientRegistration,
  type UpdateClientProfileInput,
  type UserCredentials,
} from '@/domain/clients/types';
import { adminJson } from './http';

function validated<S extends z.ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new Error(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
}

export function fetchUsers(): Promise<AdminUser[]> {
  return adminJson('/api/admin/users', AdminUserSchema.array(), {}, 'Não foi possível carregar os usuários.');
}

export function createVendedora(credentials: UserCredentials & { password: string }): Promise<AdminUser> {
  const payload = validated(CreateUserCredentialsSchema, credentials);
  return adminJson('/api/admin/users', AdminUserSchema, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  }, 'Não foi possível criar o acesso.') as Promise<AdminUser>;
}

export function updateUser(id: string, credentials: UserCredentials): Promise<AdminUser> {
  const payload = validated(UpdateTenantUserInputSchema, {
    ...credentials,
    password: credentials.password || undefined,
  });
  return adminJson(`/api/admin/users/${id}`, AdminUserSchema, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, 'Não foi possível salvar as alterações.') as Promise<AdminUser>;
}

export function deleteUser(id: string): Promise<void> {
  return adminJson(`/api/admin/users/${id}`, z.unknown(), { method: 'DELETE' }, 'Não foi possível excluir o usuário.').then(() => undefined);
}

export function createCliente(fields: ClientRegistration): Promise<AdminUser> {
  const payload = validated(ClientRegistrationSchema, fields);
  return adminJson('/api/admin/clients', AdminUserSchema, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  }, 'Não foi possível criar a cliente.') as Promise<AdminUser>;
}

// Mesmo endpoint travado usado em /workspace/clientes (ver
// customersClient.ts) — CPF/CNPJ, e-mail e telefone nunca são aceitos aqui
// quando quem edita é a equipe (ver updateTenantClient, backend). Antes
// existia uma rota administrativa paralela (/api/admin/clients/[id]) sem
// essa trava; foi removida pra não ter duas regras pro mesmo cadastro.
export function updateClient(clientId: string, fields: UpdateClientProfileInput): Promise<Client> {
  const payload = validated(UpdateClientProfileInputSchema, fields);
  return adminJson(`/api/clients/${clientId}`, ClientSchema, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  }, 'Não foi possível salvar o cadastro.');
}
