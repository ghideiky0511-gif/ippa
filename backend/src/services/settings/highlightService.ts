import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, Highlight } from "@/lib/types";
import {
    deleteHighlightRows, insertHighlightProductRow, insertHighlightRow,
    listHighlightProductRows, listHighlightRows,
} from "@/models/settingsModel";
import { ValidationError } from "@/services/shared/errors";
import { requireSettingsAdministrator } from "./settingsAuthorization";

export async function listHighlights(tenant: Tenant): Promise<Highlight[]> {
    return withTenantTransaction(tenant, {}, async (client) => {
        const [highlights, products] = await Promise.all([
            listHighlightRows(client), listHighlightProductRows(client),
        ]);
        return highlights.map((highlight) => ({
            id: highlight.id,
            label: highlight.label,
            productIds: products.filter((product) => product.highlight_id === highlight.id)
                .map((product) => product.product_id),
        }));
    });
}

export async function replaceHighlights(tenant: Tenant, actor: AuthUser, value: unknown): Promise<Highlight[]> {
    requireSettingsAdministrator(actor);
    if (!Array.isArray(value) || !value.every((highlight) => highlight && typeof highlight === "object" &&
        typeof highlight.id === "string" && typeof highlight.label === "string" &&
        Array.isArray(highlight.productIds) && highlight.productIds.every((id: unknown) => typeof id === "string"))) {
        throw new ValidationError();
    }
    const highlights = value as Highlight[];
    await withTenantTransaction(tenant, actor, async (client) => {
        await deleteHighlightRows(client);
        for (const highlight of highlights) {
            await insertHighlightRow(client, highlight);
            for (const [position, productId] of highlight.productIds.entries()) {
                await insertHighlightProductRow(client, highlight.id, productId, position);
            }
        }
    });
    return highlights;
}
