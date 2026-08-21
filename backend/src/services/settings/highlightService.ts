import { z } from "zod";
import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, Highlight } from "@/lib/types";
import { HighlightSchema } from "@/contracts/catalog";
import {
    deleteHighlightRows, insertHighlightProductRow, insertHighlightRow,
    listHighlightProductRows, listHighlightRows,
} from "@/models/settingsModel";
import { ValidationError } from "@/services/shared/errors";
import { requireSettingsAdministrator } from "./settingsAuthorization";
import { databaseId } from "@/services/shared/identifiers";

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

const HighlightsSchema = z.array(HighlightSchema);

export async function replaceHighlights(tenant: Tenant, actor: AuthUser, value: unknown): Promise<Highlight[]> {
    requireSettingsAdministrator(actor);
    const parsed = HighlightsSchema.safeParse(value);
    if (!parsed.success) throw new ValidationError("INVALID_INPUT", "Dados inválidos.", parsed.error.issues);
    const highlights = parsed.data.map((highlight) => ({ ...highlight, id: databaseId(highlight.id) }));
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
