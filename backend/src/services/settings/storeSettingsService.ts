import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { StoreSettings } from "@/lib/storeSettings";
import { PAYMENT_LINK_EXPIRATION_DEFAULT_MINUTES } from "@/lib/storeSettings";
import { findStoreSettingsRow, upsertStoreSettingsRow } from "@/models/settingsModel";

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

export async function replaceStoreSettings(tenant: Tenant, settings: StoreSettings): Promise<StoreSettings> {
    return withTenantTransaction(tenant, {}, async (client) => {
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
