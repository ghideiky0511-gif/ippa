import {
    CreateProductInputSchema,
    CreateProductResultSchema,
    ProductAdminSchema,
    RefreshProductFromErpResultSchema,
    UpdateManualProductInputSchema,
    type CreateProductInput,
    type CreateProductResult,
    type ProductAdmin,
    type RefreshProductFromErpResult,
    type UpdateManualProductInput,
} from "@/domain/products/types";
import { adminJson } from "./http";
import { revalidateCatalogCache } from "./cacheRevalidation";
import { z } from "zod";

/** Payload enxuto do seletor; evita enviar variantes e galerias completas. */
export const ProductPickerItemSchema = z.object({
    id: z.string(),
    name: z.string(),
    referenceId: z.string().optional(),
    price: z.number(),
    image: z.string().optional(),
    activeDiscount: z
        .object({ label: z.string().optional(), percent: z.number() })
        .nullable()
        .optional(),
});
export type ProductPickerItem = z.infer<typeof ProductPickerItemSchema>;

export async function fetchProductPicker(input: {
    q?: string;
    ids?: string[];
}): Promise<ProductPickerItem[]> {
    const params = new URLSearchParams();
    if (input.q?.trim()) params.set("q", input.q.trim());
    if (input.ids?.length) params.set("ids", input.ids.join(","));
    if (!params.size) return [];
    return adminJson(
        `/api/admin/products/picker?${params.toString()}`,
        z.array(ProductPickerItemSchema),
        {},
        "Não foi possível pesquisar os produtos.",
    );
}

export async function createProduct(
    product: CreateProductInput,
): Promise<CreateProductResult> {
    const payload = CreateProductInputSchema.parse(product);
    const result = await adminJson(
        "/api/admin/products",
        CreateProductResultSchema,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        },
        "Não foi possível cadastrar o produto.",
    );
    // Produto novo/editado aparece na grade e nas vitrines do catálogo
    // público (tag `catalog:{slug}`) sem esperar `revalidate: 20`.
    await revalidateCatalogCache();
    return result;
}

export async function updateManualProduct(
    id: string,
    product: UpdateManualProductInput,
): Promise<ProductAdmin> {
    const payload = UpdateManualProductInputSchema.parse(product);
    const updated = await adminJson(
        `/api/admin/products/${encodeURIComponent(id)}`,
        ProductAdminSchema,
        {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        },
        "Não foi possível salvar o produto.",
    );
    await revalidateCatalogCache();
    return updated;
}

export async function refreshProductFromErp(
    id: string,
): Promise<RefreshProductFromErpResult> {
    const result = await adminJson(
        `/api/admin/products/${encodeURIComponent(id)}/refresh-erp`,
        RefreshProductFromErpResultSchema,
        {
            method: "POST",
        },
        "Não foi possível atualizar o produto a partir do ERP.",
    );
    await revalidateCatalogCache();
    return result;
}
