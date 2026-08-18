import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import { listCatalog } from "@/models/catalogModel";
import {
    getSimilarProductsSettings,
    getStoreSettings,
    listDiscounts,
    listHighlights,
    listHomeSections,
} from "@/models/settingsModel";
import {
    authenticate,
    getAuthenticatedSession,
    getUserForToken,
    issueSession,
    logout,
} from "./authService";
import type { AuthUser } from "@/lib/types";
import type { AuditRequestContext } from "./auditService";

export function catalog(tenant: Tenant) {
    return withTenantTransaction(tenant, {}, listCatalog);
}
export function discounts(tenant: Tenant) {
    return withTenantTransaction(tenant, {}, listDiscounts);
}
export function highlights(tenant: Tenant) {
    return withTenantTransaction(tenant, {}, listHighlights);
}
export function homeSections(tenant: Tenant) {
    return withTenantTransaction(tenant, {}, listHomeSections);
}
export function storeSettings(tenant: Tenant) {
    return withTenantTransaction(tenant, {}, getStoreSettings);
}
export function similarSettings(tenant: Tenant) {
    return withTenantTransaction(tenant, {}, getSimilarProductsSettings);
}
export async function login(
    tenant: Tenant,
    email: string,
    password: string,
    context: AuditRequestContext,
): Promise<{ user: AuthUser; token: string } | null> {
    const user = await authenticate(tenant, email, password);
    return user
        ? { user, token: await issueSession(tenant, user, context) }
        : null;
}
export function currentUser(tenant: Tenant, token?: string) {
    return getUserForToken(tenant, token);
}
export function currentSession(tenant: Tenant, token?: string) {
    return getAuthenticatedSession(tenant, token);
}
export function logoutUser(
    tenant: Tenant,
    token: string | undefined,
    context: AuditRequestContext,
) {
    return logout(tenant, token, context);
}
