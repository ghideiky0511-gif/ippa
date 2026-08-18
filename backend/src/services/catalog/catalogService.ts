import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { Product, Variant } from "@/lib/types";
import {
    listInventoryBalanceRows,
    listPrimaryClassificationRows,
    listProductRows,
    listProductVariantRows,
} from "@/models/catalogModel";

export async function listCatalog(tenant: Tenant): Promise<Product[]> {
    return withTenantTransaction(tenant, {}, async (client) => {
        const products = await listProductRows(client);
        if (products.length === 0) return [];

        const [variants, balances, classifications] = await Promise.all([
            listProductVariantRows(client),
            listInventoryBalanceRows(client),
            listPrimaryClassificationRows(client),
        ]);
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
            return {
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
                ...row.attributes,
            } as Product;
        });
    });
}
