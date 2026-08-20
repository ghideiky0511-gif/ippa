import { createHash, randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser } from "@/lib/types";
import { findClientRow, findClientRowByDocumentDigits } from "@/models/clientsModel";
import {
    deleteClientAccountConfirmationRow,
    findClientAccountConfirmationByTokenHash,
    upsertClientAccountConfirmationRow,
} from "@/models/clientAccountConfirmationsModel";
import { findUserRowByClientId, findUserRowByEmail } from "@/models/usersModel";
import { findStoreSettingsRow } from "@/models/settingsModel";
import type { AuditRequestContext } from "@/services/audit";
import { notifyFirstAccessConfirmation, notifySignup } from "@/services/notifications";
import { ConflictError, NotFoundError, ValidationError } from "@/services/shared/errors";
import { createUserRecordWithPasswordHash } from "@/services/users/userService";
import { issueSession } from "./authenticationService";
import { errorMeta, logger } from "@/lib/logger";

const PASSWORD_OPTIONS = { memoryCost: 19 * 1024, timeCost: 2, parallelism: 1 };
const CONFIRMATION_TTL_MS = 30 * 60 * 1000;

export type CustomerDocumentAccess = "login" | "first_access" | "signup";

function digest(value: string): string {
    return createHash("sha256").update(value).digest("hex");
}

async function validateDocument(client: Parameters<typeof findStoreSettingsRow>[0], document: string): Promise<string> {
    const digits = document.replace(/\D/g, "");
    const settings = await findStoreSettingsRow(client);
    const validLength = digits.length === 11 || digits.length === 14;
    if (!validLength || (settings?.features?.allowCpfSignup === false && digits.length !== 14)) {
        throw new ValidationError(settings?.features?.allowCpfSignup === false ? "CNPJ_REQUIRED" : "INVALID_DOCUMENT");
    }
    return digits;
}

export async function getCustomerDocumentAccess(
    tenant: Tenant,
    document: string,
): Promise<{ state: CustomerDocumentAccess }> {
    return withTenantTransaction(tenant, {}, async (client) => {
        const digits = await validateDocument(client, document);
        const registration = await findClientRowByDocumentDigits(client, digits);
        if (!registration) return { state: "signup" };
        return { state: await findUserRowByClientId(client, registration.id) ? "login" : "first_access" };
    });
}

function confirmationLink(tenant: Tenant, token: string): string {
    const origin = (process.env.APP_URL || process.env.ADMIN_ORIGIN || "http://localhost:3010").replace(/\/+$/, "");
    return `${origin}/${tenant.slug}/confirmar-conta?token=${encodeURIComponent(token)}`;
}

export async function startCustomerFirstAccess(
    tenant: Tenant,
    document: string,
    password: string,
): Promise<{ state: "confirmation_pending" }> {
    if (password.length < 6) throw new ValidationError("WEAK_PASSWORD");
    const token = randomBytes(32).toString("base64url");
    const recipient = await withTenantTransaction(tenant, {}, async (client) => {
        const digits = await validateDocument(client, document);
        const registration = await findClientRowByDocumentDigits(client, digits);
        if (!registration) throw new NotFoundError("CLIENT_NOT_FOUND");
        if (await findUserRowByClientId(client, registration.id)) throw new ConflictError("CLIENT_ALREADY_HAS_LOGIN");
        const email = registration.email?.trim().toLowerCase();
        if (!email) throw new ValidationError("FIRST_ACCESS_EMAIL_REQUIRED");
        if (await findUserRowByEmail(client, email)) throw new ConflictError("EMAIL_TAKEN");
        await upsertClientAccountConfirmationRow(client, {
            clientId: registration.id,
            passwordHash: await hash(password, PASSWORD_OPTIONS),
            tokenHash: digest(token),
            expiresAt: new Date(Date.now() + CONFIRMATION_TTL_MS),
        });
        return { email, name: registration.name, clientId: registration.id };
    });
    logger.info("first-access", "Solicitação de primeiro acesso registrada", {
        tenantId: tenant.id,
        clientId: recipient.clientId,
    });
    try {
        await notifyFirstAccessConfirmation(tenant, recipient, confirmationLink(tenant, token));
    } catch (error) {
        // A notificação já trata e registra seus próprios erros. Esta proteção
        // mantém o endpoint estável se uma dependência futura mudar esse contrato.
        logger.error("first-access", "Falha inesperada ao disparar a confirmação", {
            tenantId: tenant.id,
            clientId: recipient.clientId,
            ...errorMeta(error),
        });
    }
    return { state: "confirmation_pending" };
}

export async function confirmCustomerFirstAccess(
    tenant: Tenant,
    token: string,
    context: AuditRequestContext,
): Promise<{ user: AuthUser; token: string }> {
    const result = await withTenantTransaction(tenant, {}, async (client) => {
        const confirmation = await findClientAccountConfirmationByTokenHash(client, digest(token));
        if (!confirmation || confirmation.expires_at <= new Date()) throw new ValidationError("INVALID_ACCOUNT_CONFIRMATION");
        const registration = await findClientRow(client, confirmation.client_id);
        if (!registration) throw new NotFoundError("CLIENT_NOT_FOUND");
        if (await findUserRowByClientId(client, registration.id)) throw new ConflictError("CLIENT_ALREADY_HAS_LOGIN");
        const email = registration.email?.trim().toLowerCase();
        if (!email) throw new ValidationError("FIRST_ACCESS_EMAIL_REQUIRED");
        const user = await createUserRecordWithPasswordHash(client, null, context, {
            email,
            name: registration.name,
            role: "cliente",
            clientId: registration.id,
            passwordHash: confirmation.password_hash,
        });
        await deleteClientAccountConfirmationRow(client, confirmation.id);
        return user;
    });
    notifySignup(tenant, result);
    return { user: result, token: await issueSession(tenant, result, context) };
}
