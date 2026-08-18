import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import type { PoolClient } from 'pg';
import { withTenantTransaction, type Tenant } from '@/lib/db/tenant';
import type { AuthUser, UserRole } from '@/lib/types';
import { findUserByEmail, findUserById, insertUser, type StoredUser } from '@/models/usersModel';
import { findActiveSession, insertSession, revokeSession } from '@/models/sessionsModel';
import { recordAuditEvent, type AuditRequestContext } from './auditService';
import { AUTHENTICATION_AUDIT_ACTIONS, USER_AUDIT_ACTIONS } from './audit/actions';

export function sessionCookieName(tenantSlug: string): string {
  return `ippa_session_${tenantSlug.replace(/[^a-z0-9-]/g, '')}`;
}
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// A biblioteca usa Argon2id por padrão; os custos seguem a recomendação base da OWASP.
const PASSWORD_OPTIONS = { memoryCost: 19 * 1024, timeCost: 2, parallelism: 1 };

function withoutPasswordHash(user: StoredUser): AuthUser {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

function tokenDigest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function defaultPermissionsFor(role: UserRole): NonNullable<AuthUser['permissions']> {
  switch (role) {
    case 'administrador': return { adminAccess: true, catalogAreas: [] };
    case 'vendedora': return { adminAccess: false, catalogAreas: ['talao', 'pedidos'] };
    default: return { adminAccess: false, catalogAreas: [] };
  }
}

export interface AuthenticatedSession {
  user: AuthUser;
  sessionId: string;
}

export async function authenticate(tenant: Tenant, email: string, password: string): Promise<AuthUser | null> {
  return withTenantTransaction(tenant, {}, async (client) => {
    const user = await findUserByEmail(client, email);
    return user && await verify(user.passwordHash, password) ? withoutPasswordHash(user) : null;
  });
}

export async function issueSession(tenant: Tenant, user: Pick<AuthUser, 'id' | 'role' | 'name'>, context: AuditRequestContext): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await withTenantTransaction(tenant, { userId: user.id, role: user.role }, async (client) => {
    const sessionId = await insertSession(client, user.id, tokenDigest(token), new Date(Date.now() + SESSION_TTL_MS));
    await recordAuditEvent(client, {
      action: AUTHENTICATION_AUDIT_ACTIONS.LOGGED_IN,
      entityId: user.id,
      actor: user,
      context: { ...context, sessionId },
    });
  });
  return token;
}

export async function getAuthenticatedSession(tenant: Tenant, token?: string): Promise<AuthenticatedSession | null> {
  if (!token) return null;
  return withTenantTransaction(tenant, {}, async (client) => {
    const session = await findActiveSession(client, tokenDigest(token));
    if (!session) return null;
    const user = await findUserById(client, session.userId);
    return user ? { user: withoutPasswordHash(user), sessionId: session.id } : null;
  });
}

export async function getUserForToken(tenant: Tenant, token?: string): Promise<AuthUser | null> {
  return (await getAuthenticatedSession(tenant, token))?.user ?? null;
}

export async function logout(tenant: Tenant, token: string | undefined, context: AuditRequestContext): Promise<void> {
  if (!token) return;
  await withTenantTransaction(tenant, {}, async (client) => {
    const session = await findActiveSession(client, tokenDigest(token));
    if (!session) return;
    const user = await findUserById(client, session.userId);
    await revokeSession(client, tokenDigest(token));
    if (user) await recordAuditEvent(client, {
      action: AUTHENTICATION_AUDIT_ACTIONS.LOGGED_OUT,
      entityId: user.id,
      actor: user,
      context: { ...context, sessionId: session.id },
    });
  });
}

export async function createUser(
  client: PoolClient,
  actor: Pick<AuthUser, 'id' | 'role' | 'name'>,
  context: AuditRequestContext,
  params: { email: string; name: string; password: string; role: UserRole; clientId?: string; permissions?: AuthUser['permissions'] },
): Promise<AuthUser> {
  const current = await findUserByEmail(client, params.email);
  if (current) throw new Error('EMAIL_TAKEN');
  const passwordHash = await hash(params.password, PASSWORD_OPTIONS);
  const created = await insertUser(client, { ...params, passwordHash, permissions: params.permissions ?? defaultPermissionsFor(params.role) });
  await recordAuditEvent(client, {
    action: USER_AUDIT_ACTIONS.CREATED,
    entityId: created.id,
    actor,
    context,
    metadata: { createdRole: created.role },
  });
  return created;
}

export function isAdministrator(user: AuthUser | null): boolean {
  return user?.role === 'administrador' && user.permissions?.adminAccess === true;
}
