import type { ActorContext, Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import { withControlTransaction } from "@/lib/db/control";
import {
    fetchVestiCatalogFeed,
    type VestiExternalVariant,
} from "@/catalog/vesti";
import { createExternalApiCallReporter } from "@/services/erp/externalApiLogService";
import { findTenantRow } from "@/models/platformModel";
import {
    findVestiCatalogSlugRow,
    upsertVestiCatalogSlugRow,
} from "@/models/settingsModel";
import {
    upsertProductByReferenceIdRow,
    upsertProductVariantRow,
    type ProductWriteRow,
} from "@/models/catalogModel";
import { findActiveErpIntegrationRow } from "@/models/erpIntegrationsModel";
import {
    createCatalogMediaCopySession,
    scrapePrimaryImageUrl,
} from "@/services/catalog/catalogMediaService";
import { errorMeta, logger } from "@/lib/logger";

// Serviço disparado pelo painel Control (services/platform/tenantService.ts
// é o precedente): resolve o tenant a partir do id da rota, sem sessão de
// tenant real, e escreve em products/product_variants pelas mesmas funções
// que o sync de ERP usa — não por SQL próprio no pool de controle — para
// que os dois pipelines fiquem fáceis de convergir depois.
const CONTROL_ACTOR: ActorContext = { role: "control" };
const MEDIA_COPY_CONCURRENCY = 8;
const MEDIA_PROGRESS_INTERVAL = 25;

async function resolveTenant(tenantId: string): Promise<Tenant> {
    const tenant = await withControlTransaction((client) =>
        findTenantRow(client, tenantId),
    );
    if (!tenant) throw new Error("TENANT_NOT_FOUND");
    return tenant;
}

export async function getVestiCatalogSlug(
    tenantId: string,
): Promise<string | null> {
    const tenant = await resolveTenant(tenantId);
    return withTenantTransaction(
        tenant,
        CONTROL_ACTOR,
        findVestiCatalogSlugRow,
    );
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

export async function setVestiCatalogSlug(
    tenantId: string,
    rawSlug: string,
): Promise<string> {
    const slug = normalizeVestiSlug(rawSlug);
    if (!slug) throw new Error("INVALID_VESTI_SLUG");
    const tenant = await resolveTenant(tenantId);
    await withTenantTransaction(tenant, CONTROL_ACTOR, (client) =>
        upsertVestiCatalogSlugRow(client, slug),
    );
    return slug;
}

export interface VestiImportSummary {
    productsCreated: number;
    productsUpdated: number;
    variantsCreated: number;
    variantsUpdated: number;
    mediaCopied: number;
    mediaFailed: number;
}

export interface VestiImportJob {
    status: "not_started" | "running" | "succeeded" | "failed";
    startedAt?: string;
    finishedAt?: string;
    summary?: VestiImportSummary;
    error?: string;
}

const importJobsByTenantId = new Map<string, VestiImportJob>();

// Sem audit_events por item — mesma decisão de erpSyncService.ts: um
// import pode trazer centenas de produtos, e um evento por item vira ruído.
export async function importVestiCatalog(
    tenantId: string,
): Promise<VestiImportSummary> {
    const startedAt = Date.now();
    const tenant = await resolveTenant(tenantId);
    const slug = await withTenantTransaction(
        tenant,
        CONTROL_ACTOR,
        findVestiCatalogSlugRow,
    );
    if (!slug) throw new Error("VESTI_SLUG_NOT_CONFIGURED");
    if (
        await withTenantTransaction(
            tenant,
            CONTROL_ACTOR,
            findActiveErpIntegrationRow,
        )
    ) {
        throw new Error("VESTI_BOOTSTRAP_AFTER_ERP");
    }
    logger.info("vesti-import", "Iniciando importação do catálogo Vesti", {
        tenantId,
        tenantSlug: tenant.slug,
        vestiCatalogSlug: slug,
    });

    const feed = await fetchVestiCatalogFeed(slug, {
        reporter: createExternalApiCallReporter(tenant, CONTROL_ACTOR, "vesti"),
    });
    logger.info("vesti-import", "Feed Vesti carregado", {
        tenantId,
        products: feed.products.length,
        variants: feed.variants.length,
    });
    const variantsByRef = new Map<string, VestiExternalVariant[]>();
    for (const variant of feed.variants) {
        const list = variantsByRef.get(variant.ref);
        if (list) list.push(variant);
        else variantsByRef.set(variant.ref, [variant]);
    }

    const mediaSession = createCatalogMediaCopySession();
    const mediaByRef = new Map<string, ProductWriteRow["media"]>();
    let mediaCopied = 0;
    let mediaFailed = 0;
    let productsWithMediaProcessed = 0;
    const mediaFailureReasons = new Map<string, number>();
    const recordMediaFailure = (error: unknown): void => {
        mediaFailed++;
        const reason =
            error instanceof Error && error.message
                ? error.message.slice(0, 120)
                : "UNKNOWN_MEDIA_ERROR";
        mediaFailureReasons.set(
            reason,
            (mediaFailureReasons.get(reason) ?? 0) + 1,
        );
    };
    const copyProductMedia = async (
        product: (typeof feed.products)[number],
    ): Promise<void> => {
        const imageKeysByColor: Record<string, string> = {};
        let primaryUrl = product.imageUrl;
        if (!primaryUrl && product.productUrl) {
            primaryUrl =
                (await scrapePrimaryImageUrl(product.productUrl)) ?? "";
        }
        const imageUrls = Array.from(
            new Set([primaryUrl, ...product.imageUrls].filter(Boolean)),
        );
        const imageKeys: string[] = [];
        for (const [index, imageUrl] of imageUrls.entries()) {
            try {
                const imageKey = await mediaSession.copy(
                    imageUrl,
                    product.ref,
                    index === 0 ? "og" : `gallery${index}`,
                );
                if (!imageKeys.includes(imageKey)) imageKeys.push(imageKey);
                mediaCopied++;
            } catch (error) {
                recordMediaFailure(error);
            }
        }
        const videoKeys: string[] = [];
        for (const [index, videoUrl] of product.videoUrls.entries()) {
            try {
                const videoKey = await mediaSession.copyVideo(
                    videoUrl,
                    product.ref,
                    `video${index + 1}`,
                );
                if (!videoKeys.includes(videoKey)) videoKeys.push(videoKey);
                mediaCopied++;
            } catch (error) {
                recordMediaFailure(error);
            }
        }
        for (const variant of variantsByRef.get(product.ref) ?? []) {
            if (
                !variant.imageUrl ||
                !variant.color ||
                imageKeysByColor[variant.color]
            )
                continue;
            try {
                imageKeysByColor[variant.color] = await mediaSession.copy(
                    variant.imageUrl,
                    product.ref,
                    variant.color,
                );
                mediaCopied++;
            } catch (error) {
                recordMediaFailure(error);
            }
        }
        mediaByRef.set(product.ref, {
            imageKey: imageKeys[0],
            imageKeys: imageKeys.length > 0 ? imageKeys : undefined,
            videoKeys: videoKeys.length > 0 ? videoKeys : undefined,
            imageKeysByColor:
                Object.keys(imageKeysByColor).length > 0
                    ? imageKeysByColor
                    : undefined,
        });
        productsWithMediaProcessed++;
        if (
            productsWithMediaProcessed === feed.products.length ||
            productsWithMediaProcessed % MEDIA_PROGRESS_INTERVAL === 0
        ) {
            logger.info("vesti-import", "Cópia de mídias Vesti em andamento", {
                tenantId,
                productsProcessed: productsWithMediaProcessed,
                productsTotal: feed.products.length,
                mediaCopied,
                mediaFailed,
            });
        }
    };
    logger.info("vesti-import", "Iniciando cópia de mídias para o R2", {
        tenantId,
        products: feed.products.length,
        concurrency: MEDIA_COPY_CONCURRENCY,
    });
    let nextProductIndex = 0;
    await Promise.all(
        Array.from(
            { length: Math.min(MEDIA_COPY_CONCURRENCY, feed.products.length) },
            async () => {
                while (nextProductIndex < feed.products.length) {
                    const product = feed.products[nextProductIndex++];
                    await copyProductMedia(product);
                }
            },
        ),
    );

    const summary: VestiImportSummary = {
        productsCreated: 0,
        productsUpdated: 0,
        variantsCreated: 0,
        variantsUpdated: 0,
        mediaCopied,
        mediaFailed,
    };
    if (summary.mediaFailed > 0) {
        logger.warn(
            "vesti-import",
            "Parte das mídias da Vesti não pôde ser copiada",
            {
                tenantId,
                mediaCopied: summary.mediaCopied,
                mediaFailed: summary.mediaFailed,
                failureReasons: Array.from(mediaFailureReasons.entries())
                    .map(([reason, count]) => `${reason}:${count}`)
                    .join(","),
            },
        );
    }
    try {
        await withTenantTransaction(tenant, CONTROL_ACTOR, async (client) => {
            if (await findActiveErpIntegrationRow(client)) {
                throw new Error("VESTI_BOOTSTRAP_AFTER_ERP");
            }
            for (const product of feed.products) {
                const productVariants = variantsByRef.get(product.ref) ?? [];
                const definedPrices = productVariants
                    .map((variant) => variant.price)
                    .filter((price): price is number => price !== undefined);
                const basePrice = definedPrices.length
                    ? Math.min(...definedPrices)
                    : 0;

                const writeRow: ProductWriteRow & { referenceId: string } = {
                    name: product.catalogTitle || product.name,
                    referenceId: product.ref,
                    price: basePrice,
                    media: mediaByRef.get(product.ref),
                    attributes: product.productUrl
                        ? { vestiProductUrl: product.productUrl }
                        : undefined,
                    isActive: product.active,
                    sourceOrigin: "bootstrap",
                };
                const { row, created } = await upsertProductByReferenceIdRow(
                    client,
                    writeRow,
                );
                if (created) summary.productsCreated++;
                else summary.productsUpdated++;

                for (const variant of productVariants) {
                    const { created: variantCreated } =
                        await upsertProductVariantRow(client, row.id, {
                            color: variant.color,
                            size: variant.size,
                            price: variant.price ?? basePrice,
                            availability: variant.active
                                ? "in_stock"
                                : "out_of_stock",
                            // variant.productCode é o "g:id" do feed do Vesti --
                            // no fashiongirl, isso é o productCode interno da
                            // TOTVS reaproveitado, não o productSku (código de
                            // barra) que o sync de ERP grava em sku (ver
                            // mapper.ts:mapTotvsModaReferenceSnapshot). Vai para
                            // bootstrap_external_code, uma coluna própria, para
                            // nunca mais colidir com o namespace de sku (já
                            // aconteceu: productCode de um produto bateu com o
                            // productSku de outro). catalogSyncService usa esse
                            // valor como camada extra e determinística de
                            // matching no primeiro sync de ERP, antes do
                            // fallback por (color, size).
                            bootstrapExternalCode: variant.productCode,
                            isActive: variant.active,
                            sourceOrigin: "bootstrap",
                        });
                    if (variantCreated) summary.variantsCreated++;
                    else summary.variantsUpdated++;
                }
            }
        });
    } catch (error) {
        logger.error("vesti-import", "Falha ao persistir a importação Vesti", {
            tenantId,
            ...errorMeta(error),
        });
        throw error;
    }
    logger.info("vesti-import", "Importação do catálogo Vesti concluída", {
        tenantId,
        ...summary,
        durationMs: Date.now() - startedAt,
    });
    return summary;
}

/**
 * Dispara a importação em segundo plano. O estado é propositalmente simples
 * (em memória), porque existe apenas uma instância do backend hoje; isso
 * evita uma migration/fila para uma operação iniciada manualmente no Control.
 */
export function startVestiCatalogImport(tenantId: string): VestiImportJob {
    const existing = importJobsByTenantId.get(tenantId);
    if (existing?.status === "running") return { ...existing };

    const job: VestiImportJob = {
        status: "running",
        startedAt: new Date().toISOString(),
    };
    importJobsByTenantId.set(tenantId, job);
    void importVestiCatalog(tenantId)
        .then((summary) => {
            job.status = "succeeded";
            job.summary = summary;
            job.finishedAt = new Date().toISOString();
        })
        .catch((error) => {
            job.status = "failed";
            job.error =
                error instanceof Error ? error.message : "VESTI_IMPORT_FAILED";
            job.finishedAt = new Date().toISOString();
            logger.error(
                "vesti-import",
                "Importação Vesti em segundo plano falhou",
                {
                    tenantId,
                    ...errorMeta(error),
                },
            );
        });
    return { ...job };
}

export function getVestiCatalogImportJob(tenantId: string): VestiImportJob {
    return {
        ...(importJobsByTenantId.get(tenantId) ?? { status: "not_started" }),
    };
}
