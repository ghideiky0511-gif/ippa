import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser } from "@/lib/types";
import { StoreSettingsSchema } from "@/contracts/catalog";
import { findStoreSettingsRow, upsertStoreSettingsRow } from "@/models/settingsModel";
import { ValidationError } from "@/services/shared/errors";
import { requireSettingsAdministrator } from "./settingsAuthorization";
import type { StoreSettings } from "./types";

export const PAYMENT_LINK_EXPIRATION_DEFAULT_MINUTES = 15;

function normalizeFeatures(features: StoreSettings["features"]): NonNullable<StoreSettings["features"]> {
    const { hidePriceWithoutLogin: legacyHidePriceWithoutLogin, publicCatalogPrices, ...rest } = features ?? {};
    return {
        ...rest,
        // Existing records used the inverse flag. The new flag takes
        // precedence once the tenant saves its settings again.
        publicCatalogPrices: publicCatalogPrices ?? legacyHidePriceWithoutLogin !== true,
    };
}

export async function getStoreSettings(tenant: Tenant): Promise<StoreSettings> {
    return withTenantTransaction(tenant, {}, async (client) => {
        const row = await findStoreSettingsRow(client);
        return row ? {
            defaultMarkup: row.default_markup ? Number(row.default_markup) : undefined,
            assignmentStrategy: row.assignment_strategy ?? undefined,
            paymentLinkExpirationMinutes: row.payment_link_expiration_minutes,
            features: normalizeFeatures(row.features),
        } : {};
    });
}

export async function replaceStoreSettings(tenant: Tenant, actor: AuthUser, value: unknown): Promise<StoreSettings> {
    requireSettingsAdministrator(actor);
    const parsed = StoreSettingsSchema.safeParse(value);
    if (!parsed.success) throw new ValidationError("INVALID_INPUT", "Dados inválidos.", parsed.error.issues);
    const settings = parsed.data;
    return withTenantTransaction(tenant, actor, async (client) => {
        await upsertStoreSettingsRow(client, {
            defaultMarkup: settings.defaultMarkup ?? null,
            assignmentStrategy: settings.assignmentStrategy ?? null,
            paymentLinkExpirationMinutes: settings.paymentLinkExpirationMinutes ?? PAYMENT_LINK_EXPIRATION_DEFAULT_MINUTES,
            features: normalizeFeatures(settings.features),
        });
        const row = await findStoreSettingsRow(client);
        return row ? {
            defaultMarkup: row.default_markup ? Number(row.default_markup) : undefined,
            assignmentStrategy: row.assignment_strategy ?? undefined,
            paymentLinkExpirationMinutes: row.payment_link_expiration_minutes,
            features: normalizeFeatures(row.features),
        } : {};
    });
}
