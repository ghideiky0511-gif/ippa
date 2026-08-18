import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser } from "@/lib/types";
import { findStoreSettingsRow, upsertStoreSettingsRow } from "@/models/settingsModel";
import { ValidationError } from "@/services/shared/errors";
import { requireSettingsAdministrator } from "./settingsAuthorization";
import type { StoreSettings } from "./types";

export const PAYMENT_LINK_EXPIRATION_DEFAULT_MINUTES = 15;

export async function getStoreSettings(tenant: Tenant): Promise<StoreSettings> {
    return withTenantTransaction(tenant, {}, async (client) => {
        const row = await findStoreSettingsRow(client);
        return row ? {
            defaultMarkup: row.default_markup ? Number(row.default_markup) : undefined,
            assignmentStrategy: row.assignment_strategy ?? undefined,
            paymentLinkExpirationMinutes: row.payment_link_expiration_minutes,
            features: row.features,
        } : {};
    });
}

export async function replaceStoreSettings(tenant: Tenant, actor: AuthUser, settings: StoreSettings): Promise<StoreSettings> {
    requireSettingsAdministrator(actor);
    const strategies = new Set(["leastBusy", "roundRobin", "any"]);
    if (settings.defaultMarkup !== undefined && (!Number.isFinite(settings.defaultMarkup) || settings.defaultMarkup <= 0)) {
        throw new ValidationError();
    }
    if (settings.assignmentStrategy !== undefined && !strategies.has(settings.assignmentStrategy)) throw new ValidationError();
    if (settings.paymentLinkExpirationMinutes !== undefined &&
        (!Number.isFinite(settings.paymentLinkExpirationMinutes) || settings.paymentLinkExpirationMinutes <= 0)) {
        throw new ValidationError();
    }
    if (settings.features !== undefined && Object.values(settings.features).some((value) => typeof value !== "boolean")) {
        throw new ValidationError();
    }
    return withTenantTransaction(tenant, actor, async (client) => {
        await upsertStoreSettingsRow(client, {
            defaultMarkup: settings.defaultMarkup ?? null,
            assignmentStrategy: settings.assignmentStrategy ?? null,
            paymentLinkExpirationMinutes: settings.paymentLinkExpirationMinutes ?? PAYMENT_LINK_EXPIRATION_DEFAULT_MINUTES,
            features: settings.features ?? {},
        });
        const row = await findStoreSettingsRow(client);
        return row ? {
            defaultMarkup: row.default_markup ? Number(row.default_markup) : undefined,
            assignmentStrategy: row.assignment_strategy ?? undefined,
            paymentLinkExpirationMinutes: row.payment_link_expiration_minutes,
            features: row.features,
        } : {};
    });
}
