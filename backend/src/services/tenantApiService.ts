import type { Tenant } from '@/lib/db/tenant';
import { withTenantTransaction } from '@/lib/db/tenant';
import { listCatalog } from '@/models/catalogModel';
import { getSimilarProductsSettings, getStoreSettings, listDiscounts, listHighlights, listHomeSections } from '@/models/settingsModel';
import { authenticate, getUserForToken, issueSession, logout } from './authService';
import type { AuthUser } from '@/lib/types';

export function catalog(tenant: Tenant) { return withTenantTransaction(tenant, {}, listCatalog); }
export function discounts(tenant: Tenant) { return withTenantTransaction(tenant, {}, listDiscounts); }
export function highlights(tenant: Tenant) { return withTenantTransaction(tenant, {}, listHighlights); }
export function homeSections(tenant: Tenant) { return withTenantTransaction(tenant, {}, listHomeSections); }
export function storeSettings(tenant: Tenant) { return withTenantTransaction(tenant, {}, getStoreSettings); }
export function similarSettings(tenant: Tenant) { return withTenantTransaction(tenant, {}, getSimilarProductsSettings); }
export async function login(tenant: Tenant, email: string, password: string): Promise<{ user: AuthUser; token: string } | null> {
  const user = await authenticate(tenant, email, password);
  return user ? { user, token: await issueSession(tenant, user) } : null;
}
export function currentUser(tenant: Tenant, token?: string) { return getUserForToken(tenant, token); }
export function logoutUser(tenant: Tenant, token?: string) { return logout(tenant, token); }
