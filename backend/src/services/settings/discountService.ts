import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, Discount } from "@/lib/types";
import {
    deleteDiscountRows, insertDiscountProductRow, insertDiscountRow, insertDiscountTierRow,
    listDiscountProductRows, listDiscountRows, listDiscountTierRows,
} from "@/models/settingsModel";
import { ValidationError } from "@/services/shared/errors";
import { requireSettingsAdministrator } from "./settingsAuthorization";

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

function validDiscounts(value: unknown): value is Discount[] {
    return Array.isArray(value) && value.every((discount) => discount && typeof discount === "object" &&
        typeof discount.id === "string" && typeof discount.label === "string" &&
        typeof discount.active === "boolean" && (discount.type === "quantity" || discount.type === "products") &&
        Number.isFinite(discount.percent) && discount.percent >= 0 && discount.percent <= 100 &&
        Array.isArray(discount.tiers) && discount.tiers.every((tier) => Number.isFinite(tier.minQty) && tier.minQty > 0 &&
            Number.isFinite(tier.percent) && tier.percent >= 0 && tier.percent <= 100) &&
        Array.isArray(discount.productIds) && discount.productIds.every((id) => typeof id === "string"));
}

export async function replaceDiscounts(tenant: Tenant, actor: AuthUser, value: unknown): Promise<Discount[]> {
    requireSettingsAdministrator(actor);
    if (!validDiscounts(value)) throw new ValidationError();
    await withTenantTransaction(tenant, actor, async (client) => {
        await deleteDiscountRows(client);
        for (const discount of value) {
            await insertDiscountRow(client, discount);
            for (const tier of discount.tiers) await insertDiscountTierRow(client, discount.id, tier.minQty, tier.percent);
            for (const productId of discount.productIds) await insertDiscountProductRow(client, discount.id, productId);
        }
    });
    return value;
}
