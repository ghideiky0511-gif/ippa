import { z } from "zod";
import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser, Discount } from "@/lib/types";
import { DiscountSchema } from "@/contracts/catalog";
import {
    deleteDiscountRows, insertDiscountProductRow, insertDiscountRow, insertDiscountTierRow,
    listDiscountProductRows, listDiscountRows, listDiscountTierRows,
} from "@/models/settingsModel";
import { ValidationError } from "@/services/shared/errors";
import { requireSettingsAdministrator } from "./settingsAuthorization";
import { databaseId } from "@/services/shared/identifiers";

// Descontos de origem ERP (ver upsertErpDiscountRow em settingsModel.ts) não
// aparecem aqui: são geridos só pelo sync, e replaceDiscounts abaixo
// substitui a lista inteira que a tela devolve -- misturá-los faria o
// lojista "perder" a promoção do ERP ao salvar qualquer desconto manual.
export async function listDiscounts(tenant: Tenant): Promise<Discount[]> {
    return withTenantTransaction(tenant, {}, async (client) => {
        const discountRows = await listDiscountRows(client);
        const tiers = await listDiscountTierRows(client);
        const products = await listDiscountProductRows(client);
        const discounts = discountRows.filter((discount) => discount.source === "manual");
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

const DiscountsSchema = z.array(DiscountSchema);

export async function replaceDiscounts(tenant: Tenant, actor: AuthUser, value: unknown): Promise<Discount[]> {
    requireSettingsAdministrator(actor);
    const parsed = DiscountsSchema.safeParse(value);
    if (!parsed.success) throw new ValidationError("INVALID_INPUT", "Dados inválidos.", parsed.error.issues);
    const discounts = parsed.data.map((discount) => ({ ...discount, id: databaseId(discount.id) }));
    await withTenantTransaction(tenant, actor, async (client) => {
        await deleteDiscountRows(client);
        for (const discount of discounts) {
            await insertDiscountRow(client, discount);
            for (const tier of discount.tiers) await insertDiscountTierRow(client, discount.id, tier.minQty, tier.percent);
            for (const productId of discount.productIds) await insertDiscountProductRow(client, discount.id, productId);
        }
    });
    return discounts;
}
