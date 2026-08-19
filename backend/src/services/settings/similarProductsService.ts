import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, SimilarProductsSettings } from "@/lib/types";
import { findSimilarProductsSettingsRow, upsertSimilarProductsSettingsRow } from "@/models/settingsModel";
import { ValidationError } from "@/services/shared/errors";
import { requireSettingsAdministrator } from "./settingsAuthorization";

const DEFAULT_SETTINGS: SimilarProductsSettings = {
    quickview: { limit: 4, rules: ["sameCategory"] },
    cart: { limit: 4, rules: ["sameCategory"] },
    complementaryCategories: {},
};

export async function getSimilarProductsSettings(tenant: Tenant): Promise<SimilarProductsSettings> {
    const row = await withTenantTransaction(tenant, {}, (client) => findSimilarProductsSettingsRow(client));
    return {
        quickview: row?.quickview ?? DEFAULT_SETTINGS.quickview,
        cart: row?.cart ?? DEFAULT_SETTINGS.cart,
        complementaryCategories: row?.complementaryCategories ?? DEFAULT_SETTINGS.complementaryCategories,
    };
}

export async function replaceSimilarProductsSettings(
    tenant: Tenant,
    actor: AuthUser,
    value: unknown,
): Promise<SimilarProductsSettings> {
    requireSettingsAdministrator(actor);
    const settings = value as SimilarProductsSettings;
    const validConfig = (config: SimilarProductsSettings["quickview"] | undefined) => config &&
        Number.isFinite(config.limit) && config.limit > 0 && Array.isArray(config.rules) &&
        config.rules.every((rule) => typeof rule === "string");
    if (!settings || typeof settings !== "object" || !validConfig(settings.quickview) || !validConfig(settings.cart) ||
        !settings.complementaryCategories || typeof settings.complementaryCategories !== "object" ||
        Array.isArray(settings.complementaryCategories) || Object.values(settings.complementaryCategories)
            .some((categories) => !Array.isArray(categories) || categories.some((category) => typeof category !== "string"))) {
        throw new ValidationError();
    }
    await withTenantTransaction(tenant, actor, (client) => upsertSimilarProductsSettingsRow(client, settings));
    return settings;
}
