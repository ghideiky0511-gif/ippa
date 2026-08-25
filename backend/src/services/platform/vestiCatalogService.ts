import type { ActorContext, Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import { withControlTransaction } from "@/lib/db/control";
import { fetchVestiCatalogFeed, type VestiExternalVariant } from "@/catalog/vesti";
import { createExternalApiCallReporter } from "@/services/erp/externalApiLogService";
import { findTenantRow } from "@/models/platformModel";
import { findVestiCatalogSlugRow, upsertVestiCatalogSlugRow } from "@/models/settingsModel";
import { upsertProductByReferenceIdRow, upsertProductVariantRow, type ProductWriteRow } from "@/models/catalogModel";

// Serviço disparado pelo painel Control (services/platform/tenantService.ts
// é o precedente): resolve o tenant a partir do id da rota, sem sessão de
// tenant real, e escreve em products/product_variants pelas mesmas funções
// que o sync de ERP usa — não por SQL próprio no pool de controle — para
// que os dois pipelines fiquem fáceis de convergir depois.
const CONTROL_ACTOR: ActorContext = { role: "control" };

async function resolveTenant(tenantId: string): Promise<Tenant> {
    const tenant = await withControlTransaction((client) => findTenantRow(client, tenantId));
    if (!tenant) throw new Error("TENANT_NOT_FOUND");
    return tenant;
}

export async function getVestiCatalogSlug(tenantId: string): Promise<string | null> {
    const tenant = await resolveTenant(tenantId);
    return withTenantTransaction(tenant, CONTROL_ACTOR, findVestiCatalogSlugRow);
}

// Aceita tanto o slug puro ("fashiongirlatacado") quanto a URL inteira do
// feed colada por engano ("https://vesti.co/fashiongirlatacado/catalogo.xml"
// ou só até a pasta) — extrai o primeiro segmento depois de vesti.co/.
function normalizeVestiSlug(rawSlug: string): string {
    const trimmed = rawSlug.trim();
    const match = trimmed.match(/^https?:\/\/(?:www\.)?vesti\.co\/([^/?#]+)/i);
    const value = match ? match[1] : trimmed;
    return value.replace(/^\/+|\/+$/g, "");
}

export async function setVestiCatalogSlug(tenantId: string, rawSlug: string): Promise<string> {
    const slug = normalizeVestiSlug(rawSlug);
    if (!slug) throw new Error("INVALID_VESTI_SLUG");
    const tenant = await resolveTenant(tenantId);
    await withTenantTransaction(tenant, CONTROL_ACTOR, (client) => upsertVestiCatalogSlugRow(client, slug));
    return slug;
}

export interface VestiImportSummary {
    productsCreated: number;
    productsUpdated: number;
    variantsCreated: number;
    variantsUpdated: number;
}

// Sem audit_events por item — mesma decisão de erpSyncService.ts: um
// import pode trazer centenas de produtos, e um evento por item vira ruído.
export async function importVestiCatalog(tenantId: string): Promise<VestiImportSummary> {
    const tenant = await resolveTenant(tenantId);
    const slug = await withTenantTransaction(tenant, CONTROL_ACTOR, findVestiCatalogSlugRow);
    if (!slug) throw new Error("VESTI_SLUG_NOT_CONFIGURED");

    const feed = await fetchVestiCatalogFeed(slug, { reporter: createExternalApiCallReporter(tenant, CONTROL_ACTOR, "vesti") });
    const variantsByRef = new Map<string, VestiExternalVariant[]>();
    for (const variant of feed.variants) {
        const list = variantsByRef.get(variant.ref);
        if (list) list.push(variant); else variantsByRef.set(variant.ref, [variant]);
    }

    const summary: VestiImportSummary = { productsCreated: 0, productsUpdated: 0, variantsCreated: 0, variantsUpdated: 0 };
    await withTenantTransaction(tenant, CONTROL_ACTOR, async (client) => {
        for (const product of feed.products) {
            const productVariants = variantsByRef.get(product.ref) ?? [];
            const definedPrices = productVariants.map((variant) => variant.price).filter((price): price is number => price !== undefined);
            const basePrice = definedPrices.length ? Math.min(...definedPrices) : 0;

            const writeRow: ProductWriteRow & { referenceId: string } = {
                name: product.catalogTitle || product.name,
                category: product.externalCategory || "Sem categoria",
                brand: product.brand || undefined,
                referenceId: product.ref,
                price: basePrice,
                media: product.imageUrl ? { image: product.imageUrl } : undefined,
                attributes: product.productUrl ? { vestiProductUrl: product.productUrl } : undefined,
            };
            const { row, created } = await upsertProductByReferenceIdRow(client, writeRow);
            if (created) summary.productsCreated++; else summary.productsUpdated++;

            for (const variant of productVariants) {
                const { created: variantCreated } = await upsertProductVariantRow(client, row.id, {
                    color: variant.color,
                    size: variant.size,
                    price: variant.price ?? basePrice,
                    availability: variant.active ? "in_stock" : "out_of_stock",
                });
                if (variantCreated) summary.variantsCreated++; else summary.variantsUpdated++;
            }
        }
    });
    return summary;
}
