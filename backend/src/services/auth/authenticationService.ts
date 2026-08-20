import { createHash, randomBytes } from "node:crypto";
import { verify } from "@node-rs/argon2";
import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser } from "@/lib/types";
import { findActiveSessionRow, insertSessionRow, revokeSessionRow } from "@/models/sessionsModel";
import { findCustomerUserRowByDocumentDigits, findUserRowByEmail, findUserRowById, type UserRow } from "@/models/usersModel";
import { findStoreSettingsRow } from "@/models/settingsModel";
import { recordAuditEvent, AUTHENTICATION_AUDIT_ACTIONS, type AuditRequestContext } from "@/services/audit";
import { isAdministrator } from "@/services/users/userService";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface AuthenticatedSession { user: AuthUser; sessionId: string }

function toAuthUser(row: UserRow): AuthUser {
    return {
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        clientId: row.client_id ?? undefined,
        permissions: row.permissions,
    };
}

function tokenDigest(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

export function sessionCookieName(tenantSlug: string): string {
    return `ippa_session_${tenantSlug.replace(/[^a-z0-9-]/g, "")}`;
}

export async function authenticate(tenant: Tenant, email: string, password: string): Promise<AuthUser | null> {
    const normalizedEmail = email.trim().toLowerCase();
    return withTenantTransaction(tenant, {}, async (client) => {
        const user = await findUserRowByEmail(client, normalizedEmail);
        return user && await verify(user.password_hash, password) ? toAuthUser(user) : null;
    });
}

export async function login(
    tenant: Tenant,
    email: string,
    password: string,
    context: AuditRequestContext,
): Promise<{ user: AuthUser; token: string } | null> {
    const user = await authenticate(tenant, email, password);
    return user ? { user, token: await issueSession(tenant, user, context) } : null;
}

/** Login público pelo documento vinculado ao cadastro da cliente. */
export async function loginByDocument(
    tenant: Tenant,
    document: string,
    password: string,
    context: AuditRequestContext,
): Promise<{ user: AuthUser; token: string } | null> {
    const user = await withTenantTransaction(tenant, {}, async (client) => {
        const digits = document.replace(/\D/g, "");
        const settings = await findStoreSettingsRow(client);
        if (settings?.features?.allowCpfSignup === false && digits.length !== 14) return null;
        const row = await findCustomerUserRowByDocumentDigits(client, digits);
        return row && await verify(row.password_hash, password) ? toAuthUser(row) : null;
    });
    return user ? { user, token: await issueSession(tenant, user, context) } : null;
}

export async function loginAdministrator(
    tenant: Tenant,
    email: string,
    password: string,
    context: AuditRequestContext,
): Promise<{ user: AuthUser; token: string } | null> {
    const user = await authenticate(tenant, email, password);
    if (!user || !isAdministrator(user)) return null;
    return { user, token: await issueSession(tenant, user, context) };
}

/** Sessão do workspace: qualquer perfil interno, nunca uma cliente. */
export async function loginInternalUser(
    tenant: Tenant,
    email: string,
    password: string,
    context: AuditRequestContext,
): Promise<{ user: AuthUser; token: string } | null> {
    const user = await authenticate(tenant, email, password);
    if (!user || user.role === "cliente") return null;
    return { user, token: await issueSession(tenant, user, context) };
}

export async function issueSession(
    tenant: Tenant,
    user: Pick<AuthUser, "id" | "role" | "name">,
    context: AuditRequestContext,
): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    await withTenantTransaction(tenant, { userId: user.id, role: user.role }, async (client) => {
        const session = await insertSessionRow(
            client, user.id, tokenDigest(token), new Date(Date.now() + SESSION_TTL_MS),
        );
        await recordAuditEvent(client, {
            action: AUTHENTICATION_AUDIT_ACTIONS.LOGGED_IN,
            entityId: user.id,
            actor: user,
            context: { ...context, sessionId: session.id },
        });
    });
    return token;
}

export async function getAuthenticatedSession(tenant: Tenant, token?: string): Promise<AuthenticatedSession | null> {
    if (!token) return null;
    return withTenantTransaction(tenant, {}, async (client) => {
        const session = await findActiveSessionRow(client, tokenDigest(token));
        if (!session) return null;
        const user = await findUserRowById(client, session.user_id);
        return user ? { user: toAuthUser(user), sessionId: session.id } : null;
    });
}

export async function getUserForToken(tenant: Tenant, token?: string): Promise<AuthUser | null> {
    return (await getAuthenticatedSession(tenant, token))?.user ?? null;
}

export async function getAdministratorForToken(tenant: Tenant, token?: string): Promise<AuthUser | null> {
    const user = await getUserForToken(tenant, token);
    return isAdministrator(user) ? user : null;
}

export async function logout(tenant: Tenant, token: string | undefined, context: AuditRequestContext): Promise<void> {
    if (!token) return;
    await withTenantTransaction(tenant, {}, async (client) => {
        const digest = tokenDigest(token);
        const session = await findActiveSessionRow(client, digest);
        if (!session) return;
        const user = await findUserRowById(client, session.user_id);
        await revokeSessionRow(client, digest);
        if (user) await recordAuditEvent(client, {
            action: AUTHENTICATION_AUDIT_ACTIONS.LOGGED_OUT,
            entityId: user.id,
            actor: toAuthUser(user),
            context: { ...context, sessionId: session.id },
        });
    });
}
