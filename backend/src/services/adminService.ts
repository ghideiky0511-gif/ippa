import type { Tenant } from '@/lib/db/tenant';
import { withTenantTransaction } from '@/lib/db/tenant';
import type { AuthUser, UserRole } from '@/lib/types';
import { listUsers } from '@/models/usersModel';
import { createUser, isAdministrator } from './authService';
import { ForbiddenError } from './commerceService';

function requireAdministrator(user: AuthUser): void {
  if (!isAdministrator(user)) throw new ForbiddenError();
}

export async function users(tenant: Tenant, actor: AuthUser): Promise<AuthUser[]> {
  requireAdministrator(actor);
  return withTenantTransaction(tenant, actor, listUsers);
}

export async function createTenantUser(tenant: Tenant, actor: AuthUser, body: { email?: unknown; name?: unknown; password?: unknown; role?: unknown; catalogAreas?: unknown }): Promise<AuthUser> {
  requireAdministrator(actor);
  const email = typeof body.email === 'string' ? body.email : null;
  const name = typeof body.name === 'string' ? body.name : null;
  const password = typeof body.password === 'string' ? body.password : null;
  if (!email || !name || !password) throw new Error('INVALID_INPUT');
  if (password.length < 12) throw new Error('WEAK_PASSWORD');
  const roles: UserRole[] = ['administrador', 'vendedora', 'expedicao', 'entregador', 'cliente'];
  if (!roles.includes(body.role as UserRole)) throw new Error('INVALID_INPUT');
  return withTenantTransaction(tenant, actor, (client) => createUser(client, {
    email, name, password, role: body.role as UserRole,
    permissions: Array.isArray(body.catalogAreas) ? { adminAccess: body.role === 'administrador', catalogAreas: body.catalogAreas.filter((area): area is string => typeof area === 'string') } : undefined,
  }));
}
