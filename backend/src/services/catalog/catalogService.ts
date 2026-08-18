import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { CategoryTreeEntry, Discount, Product, Variant } from "@/lib/types";
import {
    listCategoryMenuRows,
    listInventoryBalanceRows,
    listPrimaryClassificationRows,
    listProductPackItemRows,
    listProductPackRows,
    listProductRows,
    listProductVariantRows,
} from "@/models/catalogModel";
import {
    findStoreSettingsRow,
    listDiscountProductRows,
    listDiscountRows,
    listDiscountTierRows,
} from "@/models/settingsModel";
import { getActiveProductDiscount } from "@/services/settings/discountCalculator";

// Árvore categoria->subcategorias pro menu público — direto de `classifications`/
// `classification_types` (hierarquia real via `parent_id`, sem heurística de
// nome), já filtrada pelo opt-in do tenant (`active`, ver listCategoryMenuRows).
export async function categoryMenu(tenant: Tenant): Promise<CategoryTreeEntry[]> {
    return withTenantTransaction(tenant, {}, async (client) => {
        const rows = await listCategoryMenuRows(client);
        const categories = rows.filter((row) => row.kind === "category");
        const subcategories = rows.filter((row) => row.kind === "subcategory");
        return categories.map((category) => ({
            category: category.name,
            subcategories: subcategories.filter((sub) => sub.parent_id === category.id).map((sub) => sub.name),
        }));
    });
}

export interface CatalogFilters {
    categories: string[];
    colors: string[];
    sizes: string[];
}

export async function listCatalogFilters(tenant: Tenant): Promise<CatalogFilters> {
    return withTenantTransaction(tenant, {}, async (client) => {
        const [categories, variants] = await Promise.all([
            categoryMenu(tenant),
            listProductVariantRows(client),
        ]);

        const allColors = [...new Set(variants.map((v) => v.color).filter(Boolean))].sort();
        const allSizes = [...new Set(variants.map((v) => v.size).filter(Boolean))].sort((a, b) =>
            isNaN(Number(a)) || isNaN(Number(b)) ? a.localeCompare(b) : Number(a) - Number(b)
        );

        return {
            categories: categories.flatMap((c) => [c.category, ...c.subcategories]).filter((v, i, arr) => arr.indexOf(v) === i),
            colors: allColors,
            sizes: allSizes,
        };
    });
}

export async function listCatalog(tenant: Tenant): Promise<Product[]> {
    return withTenantTransaction(tenant, {}, async (client) => {
        const products = await listProductRows(client);
        if (products.length === 0) return [];

        const [variants, balances, classifications, packs, packItems, storeSettings, discountRows, tierRows, discountProductRows] = await Promise.all([
            listProductVariantRows(client),
            listInventoryBalanceRows(client),
            listPrimaryClassificationRows(client),
            listProductPackRows(client),
            listProductPackItemRows(client),
            findStoreSettingsRow(client),
            listDiscountRows(client),
            listDiscountTierRows(client),
            listDiscountProductRows(client),
        ]);
        const discounts: Discount[] = discountRows.map((discount) => ({
            id: discount.id,
            label: discount.label,
            active: discount.active,
            type: discount.type,
            percent: Number(discount.percent),
            tiers: tierRows.filter((tier) => tier.discount_id === discount.id)
                .map((tier) => ({ minQty: tier.min_qty, percent: Number(tier.percent) })),
            productIds: discountProductRows.filter((product) => product.discount_id === discount.id)
                .map((product) => product.product_id),
        }));
        const stockByVariant = new Map(balances.map((row) => [row.variant_id, row.stock_qty]));
        const classificationsByProduct = new Map<string, Partial<Record<"category" | "subcategory" | "collection" | "brand", string>>>();
        for (const row of classifications) {
            classificationsByProduct.set(row.product_id, {
                ...classificationsByProduct.get(row.product_id),
                [row.kind]: row.name,
            });
        }
        const variantsByProduct = new Map<string, Variant[]>();
        for (const row of variants) {
            const productVariants = variantsByProduct.get(row.product_id) ?? [];
            productVariants.push({
                id: row.id,
                color: row.color,
                size: row.size,
                price: Number(row.price),
                availability: row.availability,
                availableFrom: row.available_from ?? undefined,
                stockQty: row.track_inventory ? (stockByVariant.get(row.id) ?? 0) : undefined,
            });
            variantsByProduct.set(row.product_id, productVariants);
        }

        return products.map((row) => {
            const productVariants = variantsByProduct.get(row.id) ?? [];
            const classification = classificationsByProduct.get(row.id);
            const { manualOverride, ...attributes } = row.attributes as typeof row.attributes & {
                manualOverride?: Partial<Product>;
            };
            let product: Product = {
                id: row.id,
                name: row.name,
                description: row.description,
                category: classification?.category ?? row.category ?? "Sem categoria",
                subcategory: classification?.subcategory ?? row.subcategory ?? undefined,
                collection: classification?.collection ?? row.collection ?? undefined,
                brand: classification?.brand ?? row.brand ?? undefined,
                sku: row.sku ?? undefined,
                price: Number(row.price),
                suggestedRetailPrice: row.suggested_retail_price ? Number(row.suggested_retail_price) : undefined,
                markup: row.markup ? Number(row.markup) : undefined,
                image: row.media.image,
                images: row.media.images,
                imagesByColor: row.media.imagesByColor,
                videoUrl: row.media.videoUrl,
                colors: [...new Set(productVariants.map((variant) => variant.color))],
                sizes: [...new Set(productVariants.map((variant) => variant.size))],
                variants: productVariants,
                packs: packs.filter((pack) => pack.product_id === row.id).map((pack) => ({
                    id: pack.id,
                    scope: pack.scope,
                    label: pack.label,
                    color: pack.color ?? undefined,
                    price: Number(pack.price),
                    items: packItems.filter((item) => item.pack_id === pack.id).map((item) => ({
                        size: item.size,
                        qty: item.quantity,
                        color: item.color ?? undefined,
                    })),
                })),
                ...attributes,
                ...manualOverride,
            } as Product;
            if (storeSettings?.default_markup && product.suggestedRetailPrice === undefined && product.markup === undefined) {
                const defaultMarkup = Number(storeSettings.default_markup);
                product = {
                    ...product,
                    suggestedRetailPrice: Math.round(product.price * defaultMarkup * 100) / 100,
                    markup: defaultMarkup,
                };
            }
            const activeDiscount = getActiveProductDiscount(product.id, discounts);
            if (activeDiscount) product = { ...product, activeDiscount };
            if (storeSettings?.features?.suggestedPrice === false) {
                const withoutSuggestedPrice = { ...product };
                delete withoutSuggestedPrice.suggestedRetailPrice;
                delete withoutSuggestedPrice.markup;
                product = withoutSuggestedPrice;
            }
            return product;
        });
    });
}
