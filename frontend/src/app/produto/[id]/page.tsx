import { z } from "zod";
import { headers } from "next/headers";
import { publicUi } from "@/lib/ui";
import Link from "@/components/TenantLink";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { backendJson } from "@/lib/backend";
import { ProductSchema } from "@/domain/products/types";
import { CatalogPageSchema } from "@/domain/catalog/types";
import ProductPageDetail from "@/components/ProductPageDetail";
import SimilarProducts from "@/components/SimilarProducts";
import { cacheTag } from "@/lib/cacheTags";

const SimilarProductsResultSchema = z.object({
    products: z.array(ProductSchema),
});

// productOverrides.json é editado pela plataforma admin e precisa
// refletir aqui sem rebuild — mesmo motivo de web/src/app/page.tsx.
export const dynamic = "force-dynamic";

export default async function ProductPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const tenantSlug = (await headers()).get("x-ippa-tenant") ?? "";
    const catalogPage = await backendJson(`/api/catalog?ids=${encodeURIComponent(id)}`, CatalogPageSchema, {
        next: { revalidate: 20, tags: tenantSlug ? [cacheTag("catalog", tenantSlug)] : [] },
    });
    const product = catalogPage.items.find((item) => item.id === id);
    if (!product) notFound();

    // Mesma âncora única do quick-view (o produto sendo visto) — reaproveita
    // a regra de "quickview" (ver decisão em PLANO-PROXIMOS-PASSOS.md/plano
    // desta conversa), então editar em /ferramentas afeta as duas telas.
    const { products: similar } = await backendJson(
        "/api/similar-products",
        SimilarProductsResultSchema,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                context: "quickview",
                productIds: [product.id],
            }),
        },
    );

    return (
        <main className={`${publicUi.container} pb-14`}>
            <Link href="/catalogo" scroll={false} className={publicUi.backLink}>
                <ArrowLeft className="size-4" aria-hidden="true" />
                Voltar ao catálogo
            </Link>
            <ProductPageDetail product={product} />
            <SimilarProducts products={similar} />
        </main>
    );
}
