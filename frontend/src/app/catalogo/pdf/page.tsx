import { z } from "zod";
import { publicUi } from "@/lib/ui";
import ProductImage from "@/components/ProductImage";
import { getProductsByIds } from "@/lib/catalogFacets";
import { backendJson } from "@/lib/backend";
import { formatBRL } from "@/lib/format";
import PrintButton from "@/components/PrintButton";
import { CatalogPageSchema, HighlightSchema } from "@/domain/catalog/types";

// `searchParams` já é uma Request-time API — só de usar isso a página vira
// dynamic sozinha, não precisa de `export const dynamic` aqui.
export default async function CatalogoPdfPage({
    searchParams,
}: {
    searchParams: Promise<{ destaque?: string }>;
}) {
    const { destaque } = await searchParams;
    const highlights = await backendJson(
        "/api/highlights",
        z.array(HighlightSchema),
    );
    const highlight = highlights.find((h) => h.id === destaque);
    const catalog =
        highlight && highlight.productIds.length > 0
            ? await backendJson(
                  `/api/catalog?ids=${highlight.productIds.map(encodeURIComponent).join(",")}`,
                  CatalogPageSchema,
              )
            : null;
    const products =
        highlight && catalog
            ? getProductsByIds(catalog.items, highlight.productIds)
            : [];

    return (
        <div className={publicUi.pdfPage}>
            <div className={publicUi.pdfToolbar}>
                <PrintButton />
                <p>
                    Use o botão acima e escolha &quot;Salvar como PDF&quot; na
                    janela de impressão do navegador.
                </p>
            </div>

            <h1>{highlight?.label || "Coleção não encontrada"}</h1>

            {products.length === 0 ? (
                <p>Nenhum produto nesta coleção.</p>
            ) : (
                <div className={publicUi.pdfGrid}>
                    {products.map((p) => (
                        <div key={p.id} className={publicUi.pdfItem}>
                            <ProductImage
                                src={p.image}
                                alt={p.name}
                                className="aspect-[9/16] w-full rounded-md bg-[#eee]"
                            />
                            <div className="contents">{p.name}</div>
                            <div className="contents">{formatBRL(p.price)}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
