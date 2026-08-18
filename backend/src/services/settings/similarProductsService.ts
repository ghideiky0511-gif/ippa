import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { SimilarProductsSettings } from "@/lib/types";
import { findSimilarProductsSettingsRow } from "@/models/settingsModel";

const DEFAULT_SETTINGS: SimilarProductsSettings = {
    quickview: { limit: 4, rules: ["sameCategory"] },
    cart: { limit: 4, rules: ["sameCategory"] },
    complementaryCategories: {},
};

export async function getSimilarProductsSettings(tenant: Tenant): Promise<SimilarProductsSettings> {
    return withTenantTransaction(tenant, {}, async (client) =>
        (await findSimilarProductsSettingsRow(client)) ?? DEFAULT_SETTINGS,
    );
}
