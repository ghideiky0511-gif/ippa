import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { withControlTransaction } from '@/lib/db/control';
import {
  findPlatformUserByEmail,
  findPlatformUserBySession,
  insertPlatformSession,
  insertTenantAdministrator,
  insertTenant,
  insertTenantDefaults,
  listPlatformTenants,
  revokePlatformSession,
  setTenantStatus,
  type PlatformTenant,
  type PlatformUserRow,
  type TenantStatus,
} from '@/models/platformModel';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PASSWORD_OPTIONS = { memoryCost: 19 * 1024, timeCost: 2, parallelism: 1 };
const RESERVED_SLUGS = new Set(['admin', 'api', 'control', 'favicon.ico']);

export interface PlatformUser {
  id: string;
  email: string;
  name: string;
}

function tokenDigest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function safeUser(user: PlatformUserRow): PlatformUser {
  return { id: user.id, email: user.email, name: user.name };
}

export async function authenticatePlatform(email: string, password: string): Promise<PlatformUser | null> {
  return withControlTransaction(async (client) => {
    const user = await findPlatformUserByEmail(client, email);
    return user && await verify(user.password_hash, password) ? safeUser(user) : null;
  });
}

export async function issuePlatformSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await withControlTransaction((client) => insertPlatformSession(client, userId, tokenDigest(token), new Date(Date.now() + SESSION_TTL_MS)));
  return token;
}

export async function getPlatformUser(token?: string): Promise<PlatformUser | null> {
  if (!token) return null;
  return withControlTransaction(async (client) => {
    const user = await findPlatformUserBySession(client, tokenDigest(token));
    return user ? safeUser(user) : null;
  });
}

export async function logoutPlatform(token?: string): Promise<void> {
  if (!token) return;
  await withControlTransaction((client) => revokePlatformSession(client, tokenDigest(token)));
}

export async function listTenants(): Promise<PlatformTenant[]> {
  return withControlTransaction(listPlatformTenants);
}

export async function provisionTenant(input: {
  slug: string; name: string; adminName: string; adminEmail: string; adminPassword: string;
}): Promise<PlatformTenant> {
  const slug = input.slug.trim().toLowerCase();
  const name = input.name.trim();
  const adminName = input.adminName.trim();
  const adminEmail = input.adminEmail.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug) || RESERVED_SLUGS.has(slug)) throw new Error('INVALID_SLUG');
  if (!name || !adminName || !/^\S+@\S+\.\S+$/.test(adminEmail) || input.adminPassword.length < 12) throw new Error('INVALID_TENANT_INPUT');

  return withControlTransaction(async (client) => {
    const tenant = await insertTenant(client, slug, name);
    await insertTenantDefaults(client, tenant.id);
    await insertTenantAdministrator(client, tenant.id, adminEmail, adminName, await hash(input.adminPassword, PASSWORD_OPTIONS));
    return { ...tenant, status: 'active', active: true, createdAt: new Date().toISOString() };
  });
}

export async function changeTenantStatus(id: string, status: string): Promise<PlatformTenant | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id) || !['active', 'inactive', 'archived'].includes(status)) throw new Error('INVALID_TENANT_STATUS');
  return withControlTransaction((client) => setTenantStatus(client, id, status as TenantStatus));
}
