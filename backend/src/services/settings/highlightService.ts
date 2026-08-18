import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { Highlight } from "@/lib/types";
import { listHighlightProductRows, listHighlightRows } from "@/models/settingsModel";

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
