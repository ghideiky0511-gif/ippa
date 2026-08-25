import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, SimilarProductsSettings } from "@/lib/types";
import { SimilarProductsSettingsSchema } from "@/contracts/catalog";
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
    const parsed = SimilarProductsSettingsSchema.safeParse(value);
    if (!parsed.success) throw new ValidationError("INVALID_INPUT", "Dados inválidos.", parsed.error.issues);
    const settings = parsed.data;
    await withTenantTransaction(tenant, actor, (client) => upsertSimilarProductsSettingsRow(client, settings));
    return settings;
}
