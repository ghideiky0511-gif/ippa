import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { Discount } from "@/lib/types";
import { listDiscountProductRows, listDiscountRows, listDiscountTierRows } from "@/models/settingsModel";

export async function listDiscounts(tenant: Tenant): Promise<Discount[]> {
    return withTenantTransaction(tenant, {}, async (client) => {
        const [discounts, tiers, products] = await Promise.all([
            listDiscountRows(client), listDiscountTierRows(client), listDiscountProductRows(client),
        ]);
        return discounts.map((discount) => ({
            id: discount.id,
            label: discount.label,
            active: discount.active,
            type: discount.type,
            percent: Number(discount.percent),
            tiers: tiers.filter((tier) => tier.discount_id === discount.id)
                .map((tier) => ({ minQty: tier.min_qty, percent: Number(tier.percent) })),
            productIds: products.filter((product) => product.discount_id === discount.id)
                .map((product) => product.product_id),
        }));
    });
}
