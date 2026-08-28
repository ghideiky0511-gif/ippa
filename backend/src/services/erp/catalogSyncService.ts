import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { Tenant, ActorContext } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import { withControlTransaction } from "@/lib/db/control";
import { createErpProvider } from "@/erp/registry";
import type {
    ErpPriceSnapshot,
    ErpProductChangeWindow,
    ErpProvider,
    ErpReferenceSnapshot,
    ErpSkuSnapshot,
    ErpStockSnapshot,
} from "@/erp/types";
import { createExternalApiCallReporter } from "@/services/erp/externalApiLogService";
import { findActiveErpIntegrationRow, type ErpIntegrationRow } from "@/models/erpIntegrationsModel";
import {
    acquireCatalogSyncLeaseRow,
    claimDueCatalogSyncItemsRow,
    completeCatalogSyncItemRow,
    deactivateProductsNotSeenInFullRunRow,
    ensureCatalogSyncStateRow,
    findCatalogSyncConfigRow,
    findOpenFullCatalogSyncRunRow,
    finishCatalogSyncRunRow,
    insertCatalogSyncRunRow,
    listFinalizableCatalogSyncRunsRow,
    markCatalogDiscoveryCompleteRow,
    markCatalogSyncRunFailedRow,
    markFullSyncCompletedRow,
    releaseCatalogSyncLeaseRow,
    retryCatalogSyncItemRow,
    stageCatalogSyncItemsRow,
    type CatalogSyncConfigRow,
    type CatalogSyncMode,
    type CatalogSyncRunRow,
    type CatalogSyncStateRow,
} from "@/models/catalogSyncModel";
import { replaceProductCompositionsRow } from "@/models/productCompositionModel";
import {
    deactivateMissingProductVariantsRow,
    listProductVariantsForSyncRow,
    setProductSyncActiveRow,
    upsertErpProductRow,
    upsertErpProductVariantRow,
    type ProductVariantRow,
} from "@/models/catalogModel";
import { deactivateErpDiscountRow, upsertErpDiscountRow } from "@/models/settingsModel";
import {
    lockClassificationIntegrationRow,
    replaceVariantClassificationsRow,
} from "@/models/classificationModel";
import {
    findInternalIdByExternalId,
    listExternalReferencesByEntityRow,
    upsertExternalReferenceRow,
} from "@/models/erpExternalReferencesModel";
import { applyErpInventorySnapshotRow } from "@/models/inventorySyncModel";
import { invalidateVariantStock } from "@/services/inventory/stockCacheService";
import { errorMeta, logger } from "@/lib/logger";

const SYSTEM_ACTOR: ActorContext = { role: "catalog_sync" };
const RETRY_DELAYS_SECONDS = [60, 300, 900, 3600, 14_400] as const;
const FULL_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface SyncRuntime {
    tenant: Tenant;
    integration: ErpIntegrationRow;
    config: CatalogSyncConfigRow;
    provider: ErpProvider;
    run: CatalogSyncRunRow;
}

export interface CatalogSyncResult {
    tenantId: string;
    integrationId: string;
    runId?: string;
    mode: CatalogSyncMode;
    acquired: boolean;
    discovered: number;
    processed: number;
    failed: number;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function shouldPublishReference(
    reference: ErpReferenceSnapshot,
    config: Pick<CatalogSyncConfigRow, "classification_type_code" | "classification_codes">,
): boolean {
    const allowed = new Set(config.classification_codes.map((code) => code.trim()).filter(Boolean));
    const classificationMatches = config.classification_type_code !== null
        && reference.classifications.some((classification) =>
            classification.typeCode === config.classification_type_code
            && Boolean(classification.code && allowed.has(classification.code)),
        );
    return classificationMatches
        && reference.skus.some((sku) => sku.isActive && !sku.isBlocked);
}

export function retryDelaySeconds(attemptsAlreadyMade: number): number | null {
    return RETRY_DELAYS_SECONDS[attemptsAlreadyMade] ?? null;
}

function chooseMode(requested: CatalogSyncMode, state: CatalogSyncStateRow): CatalogSyncMode {
    if (requested === "full" || !state.checkpoint_at) return "full";
    if (!state.last_full_sync_at || Date.now() - state.last_full_sync_at.getTime() >= FULL_SYNC_INTERVAL_MS) return "full";
    return "incremental";
}

function stockTotalForSku(stock: ErpStockSnapshot[], skuExternalId: string): number {
    return Math.max(0, Math.trunc(stock
        .filter((entry) => entry.skuExternalId === skuExternalId)
        .reduce((sum, entry) => sum + entry.quantity, 0)));
}

export async function applyStock(
    client: PoolClient,
    input: {
        runtime: SyncRuntime;
        variantId: string;
        sku: ErpSkuSnapshot;
        entries: ErpStockSnapshot[];
    },
): Promise<void> {
    for (const entry of input.entries) {
        await applyErpInventorySnapshotRow(client, {
            provider: input.runtime.integration.provider,
            integrationId: input.runtime.integration.id,
            variantId: input.variantId,
            skuExternalId: input.sku.externalId,
            locationExternalId: entry.locationExternalId,
            locationName: entry.locationName,
            quantity: entry.quantity,
            runId: input.runtime.run.id,
        });
    }
}

export async function processSku(
    client: PoolClient,
    input: {
        runtime: SyncRuntime;
        productId: string;
        sku: ErpSkuSnapshot;
        price?: ErpPriceSnapshot;
        stock: ErpStockSnapshot[];
        existingVariantId?: string;
        referenceCode: string;
    },
): Promise<string> {
    const active = input.sku.isActive && !input.sku.isBlocked;
    const stockQty = stockTotalForSku(input.stock, input.sku.externalId);
    const variant = await upsertErpProductVariantRow(client, {
        id: input.existingVariantId,
        productId: input.productId,
        value: {
            sku: input.sku.sku,
            color: input.sku.color,
            size: input.sku.size,
            price: input.price?.price ?? 0,
            availability: active && stockQty > 0 ? "in_stock" : "out_of_stock",
            trackInventory: true,
            isActive: active,
            sourceOrigin: "erp",
        },
    });
    await upsertExternalReferenceRow(client, {
        integrationId: input.runtime.integration.id,
        entityType: "product_variant",
        internalId: variant.id,
        externalId: input.sku.externalId,
        metadata: {
            sku: input.sku.sku ?? null,
            referenceCode: input.referenceCode,
            ...(input.runtime.run.mode === "full" ? { lastFullRunId: input.runtime.run.id } : {}),
        },
    });
    await applyStock(client, {
        runtime: input.runtime,
        variantId: variant.id,
        sku: input.sku,
        entries: input.stock.filter((entry) => entry.skuExternalId === input.sku.externalId),
    });
    return variant.id;
}

// Cascade de matching entre um SKU vindo do ERP e uma variante já existente
// no banco, do mais para o menos confiável:
//  1. erp_external_references (entity_type='product_variant') -- já
//     confirmado num sync anterior.
//  2. bootstrap_external_code -- código do feed de origem do bootstrap
//     (ex.: g:id do Vesti), gravado antes de existir integração ERP.
//     Determinístico como (1), mas ainda não promovido a external reference.
//  3. sku (código de barra/productSku) coincidindo por valor.
//  4. fallback heurístico por (color, size), inclusive para variantes ERP
//     legadas sem external reference. A chave é única no banco, portanto é
//     seguro reconciliar uma única ocorrência independentemente da origem.
export function matchExistingVariantId(input: {
    sku: ErpSkuSnapshot;
    variants: ProductVariantRow[];
    externalVariantId: Map<string, string>;
    usedVariantIds: Set<string>;
}): string | undefined {
    const { sku, variants, externalVariantId, usedVariantIds } = input;
    let existingId = externalVariantId.get(sku.externalId);

    if (!existingId) {
        const byBootstrapCode = variants.filter((variant) =>
            variant.bootstrap_external_code === sku.externalId && !usedVariantIds.has(variant.id),
        );
        if (byBootstrapCode.length > 1) {
            throw new Error(`CATALOG_VARIANT_MATCH_AMBIGUOUS:${sku.externalId}`);
        }
        if (byBootstrapCode.length === 1) existingId = byBootstrapCode[0].id;
    }
    if (!existingId && sku.sku) {
        const bySku = variants.filter((variant) => variant.sku === sku.sku && !usedVariantIds.has(variant.id));
        if (bySku.length === 1) existingId = bySku[0].id;
    }
    if (!existingId) {
        const colorSizeMatch = variants.filter((variant) =>
            variant.color === sku.color && variant.size === sku.size
            && !usedVariantIds.has(variant.id),
        );
        if (colorSizeMatch.length > 1) {
            throw new Error(`CATALOG_VARIANT_MATCH_AMBIGUOUS:${sku.externalId}`);
        }
        if (colorSizeMatch.length === 1) existingId = colorSizeMatch[0].id;
    }
    return existingId;
}

export async function processReference(
    runtime: SyncRuntime,
    referenceCode: string,
): Promise<boolean> {
    const reference = await runtime.provider.fetchReference(referenceCode);
    if (!reference) {
        await withTenantTransaction(runtime.tenant, SYSTEM_ACTOR, async (client) => {
            const productId = await findInternalIdByExternalId(
                client, runtime.integration.id, "product", referenceCode,
            );
            if (productId) await setProductSyncActiveRow(client, productId, false);
        });
        return false;
    }

    const skuExternalIds = reference.skus.map((sku) => sku.externalId);
    const [prices, stock] = await Promise.all([
        runtime.provider.fetchPrices(skuExternalIds),
        runtime.provider.fetchStock(skuExternalIds),
    ]);
    const priceBySku = new Map(prices.map((price) => [price.skuExternalId, price]));
    const activePriceSnapshots = reference.skus
        .filter((sku) => sku.isActive && !sku.isBlocked)
        .map((sku) => priceBySku.get(sku.externalId))
        .filter((price): price is ErpPriceSnapshot => price !== undefined && price.price >= 0);
    const activePrices = activePriceSnapshots.map((snapshot) => snapshot.price);
    const productPrice = activePrices.length > 0 ? Math.min(...activePrices) : 0;
    // Preço promocional do produto: o menor promotionalPrice válido (abaixo
    // do preço normal escolhido) entre os SKUs ativos -- mesmo critério de
    // "pega o mais barato entre os SKUs" já usado para productPrice acima,
    // nunca sobrescreve productPrice, vira desconto separado (ver abaixo).
    const promotionalPrices = activePriceSnapshots
        .map((snapshot) => snapshot.promotionalPrice)
        .filter((value): value is number => value !== undefined && value > 0 && value < productPrice);
    const productPromotionalPrice = promotionalPrices.length > 0 ? Math.min(...promotionalPrices) : undefined;
    const missingPriceSkuIds = reference.skus
        .filter((sku) => sku.isActive && !sku.isBlocked && !priceBySku.has(sku.externalId))
        .map((sku) => sku.externalId);
    logger.info("catalog-sync", "Preço do produto calculado para persistência", {
        tenantId: runtime.tenant.id,
        integrationId: runtime.integration.id,
        runId: runtime.run.id,
        referenceCode: reference.externalId,
        skuCount: reference.skus.length,
        returnedPriceCount: prices.length,
        activePrices: activePrices.join(","),
        missingPriceSkuIds: missingPriceSkuIds.join(","),
        productPrice,
        productPromotionalPrice: productPromotionalPrice ?? null,
    });
    if (activePrices.length === 0) {
        logger.warn("catalog-sync", "Produto será salvo com preço zero porque o ERP não forneceu preço válido", {
            tenantId: runtime.tenant.id,
            integrationId: runtime.integration.id,
            runId: runtime.run.id,
            referenceCode: reference.externalId,
            skuExternalIds: skuExternalIds.join(","),
        });
    }
    const publicationActive = shouldPublishReference(reference, runtime.config);

    // Preço e desconto ficam numa transação própria, separada da
    // reconciliação de variantes abaixo: essa segunda etapa pode falhar por
    // ambiguidade de matching (CATALOG_VARIANT_MATCH_AMBIGUOUS) e, se tudo
    // estivesse numa única transação, o rollback desfaria também a correção
    // de preço/promoção que o ERP já confirmou -- deixando uma promoção
    // velha (ex.: 100% de desconto de uma sincronização anterior) presa no
    // produto até a causa da ambiguidade ser resolvida.
    const productId = await withTenantTransaction(runtime.tenant, SYSTEM_ACTOR, async (client) => {
        await lockClassificationIntegrationRow(client, runtime.integration.id);
        const product = await upsertErpProductRow(client, {
            name: reference.name,
            description: reference.description,
            referenceId: reference.externalId,
            price: productPrice,
            isActive: publicationActive,
            sourceOrigin: "erp",
        });
        logger.info("catalog-sync", "Preço do produto salvo", {
            tenantId: runtime.tenant.id,
            integrationId: runtime.integration.id,
            runId: runtime.run.id,
            referenceCode: reference.externalId,
            productId: product.row.id,
            requestedPrice: productPrice,
            persistedPrice: product.row.price,
            created: product.created,
        });

        // Preço promocional do ERP vira desconto "peças específicas" deste
        // produto (source='erp'), nunca troca productPrice -- ver comentário
        // em ErpPriceSnapshot.promotionalPrice. Sem promoção válida nesta
        // sincronização, desativa a promoção anterior em vez de deixá-la
        // travada num preço que o ERP já não pratica mais.
        if (productPromotionalPrice !== undefined) {
            const percent = Math.round((1 - productPromotionalPrice / productPrice) * 100);
            if (percent > 0) {
                await upsertErpDiscountRow(client, {
                    productId: product.row.id,
                    label: "Promoção ERP",
                    percent,
                    active: publicationActive,
                });
                logger.info("catalog-sync", "Desconto de promoção do ERP salvo", {
                    tenantId: runtime.tenant.id,
                    integrationId: runtime.integration.id,
                    runId: runtime.run.id,
                    referenceCode: reference.externalId,
                    productId: product.row.id,
                    productPrice,
                    productPromotionalPrice,
                    percent,
                });
            } else {
                await deactivateErpDiscountRow(client, product.row.id);
            }
        } else {
            await deactivateErpDiscountRow(client, product.row.id);
        }

        await upsertExternalReferenceRow(client, {
            integrationId: runtime.integration.id,
            entityType: "product",
            internalId: product.row.id,
            externalId: reference.externalId,
            metadata: runtime.run.mode === "full" ? { lastFullRunId: runtime.run.id } : {},
        });

        return product.row.id;
    });

    let touchedVariantIds: string[] = [];
    await withTenantTransaction(runtime.tenant, SYSTEM_ACTOR, async (client) => {
        const variants = await listProductVariantsForSyncRow(client, productId);
        const variantReferences = await listExternalReferencesByEntityRow(
            client, runtime.integration.id, "product_variant",
        );
        const externalVariantId = new Map(variantReferences.map((row) => [row.external_id, row.internal_id]));
        const usedVariantIds = new Set<string>();
        const seenVariantIds: string[] = [];

        for (const sku of reference.skus) {
            let existingId: string | undefined;
            try {
                existingId = matchExistingVariantId({ sku, variants, externalVariantId, usedVariantIds });
            } catch (error) {
                throw new Error(`CATALOG_VARIANT_MATCH_AMBIGUOUS:${reference.externalId}:${sku.externalId}`, { cause: error });
            }
            if (existingId) usedVariantIds.add(existingId);
            const variantId = await processSku(client, {
                runtime,
                productId,
                sku,
                price: priceBySku.get(sku.externalId),
                stock,
                existingVariantId: existingId,
                referenceCode: reference.externalId,
            });
            usedVariantIds.add(variantId);
            seenVariantIds.push(variantId);
            await replaceVariantClassificationsRow(client, {
                integrationId: runtime.integration.id,
                variantId,
                classifications: sku.classifications,
            });
        }
        await deactivateMissingProductVariantsRow(client, productId, seenVariantIds);
        await setProductSyncActiveRow(client, productId, publicationActive);
        touchedVariantIds = seenVariantIds;
    });
    // Depois do commit, não antes -- invalidar antes deixaria um leitor
    // concorrente recachear o valor antigo (ainda visível via MVCC) bem no
    // instante em que o novo valor está sendo gravado.
    await invalidateVariantStock(runtime.tenant, touchedVariantIds);
    return true;
}

// Atualização pontual de uma única referência, sob demanda (fora da janela de
// descoberta/fila do sync periódico) — reaproveita o mesmo cascade de
// processReference (dados gerais, descrição, SKUs, preço, estoque,
// classificações) e, por cima, busca composição se o provider suportar
// (fetchCompositions é opcional: multiprovider sem quebrar quem não tem esse
// dado). Cria um catalog_sync_runs de verdade em vez de forjar um objeto de
// run, pra manter observabilidade e não inventar um "run fake" fora do
// modelo de dados existente. Não usa o lease de syncTenantCatalog: uma
// chamada sob demanda pode, em tese, correr em paralelo com o sync
// periódico da mesma referência, mas ambos escrevem via transações curtas e
// idempotentes (upsert por reference_id/external_id), então o pior caso é
// uma leitura intermediária inconsistente, não corrupção.
export async function syncReferenceOnDemand(
    tenant: Tenant,
    referenceCode: string,
): Promise<{ status: "updated" | "not_found"; runId: string }> {
    const { integration, config } = await loadSyncContext(tenant);
    logger.info("catalog-sync", "Iniciando sincronização pontual de referência", {
        tenantId: tenant.id,
        integrationId: integration.id,
        provider: integration.provider,
        referenceCode,
    });
    const provider = createErpProvider(
        integration.provider,
        integration.credentials,
        createExternalApiCallReporter(tenant, SYSTEM_ACTOR, integration.provider),
    );
    const run = await withTenantTransaction(tenant, SYSTEM_ACTOR, (client) =>
        insertCatalogSyncRunRow(client, {
            integrationId: integration.id, mode: "incremental", windowEnd: new Date(),
        }),
    );
    const runtime: SyncRuntime = { tenant, integration, config, provider, run };
    try {
        const found = await processReference(runtime, referenceCode);
        if (found && provider.fetchCompositions) {
            const compositions = await provider.fetchCompositions(referenceCode);
            await withTenantTransaction(tenant, SYSTEM_ACTOR, async (client) => {
                const productId = await findInternalIdByExternalId(
                    client, integration.id, "product", referenceCode,
                );
                if (productId) {
                    await replaceProductCompositionsRow(client, {
                        productId, provider: integration.provider, compositions,
                    });
                }
            });
        }
        await withTenantTransaction(tenant, SYSTEM_ACTOR, (client) =>
            finishCatalogSyncRunRow(client, run.id, true),
        );
        const status = found ? "updated" : "not_found";
        logger.info("catalog-sync", "Sincronização pontual de referência concluída", {
            tenantId: tenant.id,
            integrationId: integration.id,
            provider: integration.provider,
            referenceCode,
            runId: run.id,
            status,
        });
        return { status, runId: run.id };
    } catch (error) {
        await withTenantTransaction(tenant, SYSTEM_ACTOR, (client) =>
            markCatalogSyncRunFailedRow(client, run.id, errorMessage(error)),
        ).catch(() => undefined);
        logger.warn("catalog-sync", "Falha na sincronização pontual de referência", {
            tenantId: tenant.id,
            integrationId: integration.id,
            provider: integration.provider,
            referenceCode,
            runId: run.id,
            ...errorMeta(error),
        });
        throw error;
    }
}

// Fallback de reconciliação de bootstrap: só providers que expõem o lookup
// retornam uma referência. Hoje é implementado pelo TOTVS Moda; os demais
// mantêm o fluxo usual e retornam null.
export async function findReferenceCodeByProductCodeOnDemand(
    tenant: Tenant,
    productCode: string,
): Promise<string | null> {
    const { integration } = await loadSyncContext(tenant);
    const provider = createErpProvider(
        integration.provider,
        integration.credentials,
        createExternalApiCallReporter(tenant, SYSTEM_ACTOR, integration.provider),
    );
    if (!provider.findReferenceCodeByProductCode) {
        logger.info("catalog-sync", "Provider não suporta resolver referência por productCode", {
            tenantId: tenant.id,
            integrationId: integration.id,
            provider: integration.provider,
            productCode,
        });
        return null;
    }
    logger.info("catalog-sync", "Buscando referência ERP por productCode", {
        tenantId: tenant.id,
        integrationId: integration.id,
        provider: integration.provider,
        productCode,
    });
    try {
        const referenceCode = await provider.findReferenceCodeByProductCode(productCode);
        logger.info("catalog-sync", "Busca de referência por productCode concluída", {
            tenantId: tenant.id,
            integrationId: integration.id,
            provider: integration.provider,
            productCode,
            referenceCode,
            found: Boolean(referenceCode),
        });
        return referenceCode;
    } catch (error) {
        logger.warn("catalog-sync", "Falha ao buscar referência ERP por productCode", {
            tenantId: tenant.id,
            integrationId: integration.id,
            provider: integration.provider,
            productCode,
            ...errorMeta(error),
        });
        throw error;
    }
}

async function finalizeRuns(runtime: SyncRuntime): Promise<void> {
    const runs = await withTenantTransaction(runtime.tenant, SYSTEM_ACTOR, (client) =>
        listFinalizableCatalogSyncRunsRow(client, runtime.integration.id),
    );
    for (const run of runs) {
        await withTenantTransaction(runtime.tenant, SYSTEM_ACTOR, async (client) => {
            const succeeded = run.failed_count === 0;
            if (succeeded && run.mode === "full") {
                await deactivateProductsNotSeenInFullRunRow(client, runtime.integration.id, run.id);
                await markFullSyncCompletedRow(client, runtime.integration.id);
            }
            await finishCatalogSyncRunRow(client, run.id, succeeded);
        });
    }
}

async function processDueItems(runtime: SyncRuntime): Promise<{ processed: number; failed: number }> {
    const items = await withTenantTransaction(runtime.tenant, SYSTEM_ACTOR, (client) =>
        claimDueCatalogSyncItemsRow(client, runtime.integration.id),
    );
    let processed = 0;
    let failed = 0;
    for (const item of items) {
        try {
            const itemRun = item.run_id === runtime.run.id
                ? runtime.run
                : await loadRun(runtime.tenant, item.run_id);
            await processReference({ ...runtime, run: itemRun }, item.reference_code);
            await withTenantTransaction(runtime.tenant, SYSTEM_ACTOR, (client) =>
                completeCatalogSyncItemRow(client, item.id),
            );
            processed += 1;
        } catch (error) {
            failed += 1;
            logger.warn("catalog-sync", "Falha ao processar referência", {
                tenantId: runtime.tenant.id,
                integrationId: runtime.integration.id,
                referenceCode: item.reference_code,
                ...errorMeta(error),
            });
            await withTenantTransaction(runtime.tenant, SYSTEM_ACTOR, (client) =>
                retryCatalogSyncItemRow(
                    client, item.id, errorMessage(error), retryDelaySeconds(item.attempts),
                ),
            );
        }
    }
    await finalizeRuns(runtime);
    return { processed, failed };
}

async function loadRun(tenant: Tenant, runId: string): Promise<CatalogSyncRunRow> {
    return withTenantTransaction(tenant, SYSTEM_ACTOR, async (client) => {
        const result = await client.query<CatalogSyncRunRow>(
            `SELECT id, integration_id, mode, status, window_start, window_end
             FROM catalog_sync_runs WHERE tenant_id = app_tenant_id() AND id = $1`,
            [runId],
        );
        if (!result.rows[0]) throw new Error("CATALOG_SYNC_RUN_NOT_FOUND");
        return result.rows[0];
    });
}

async function loadSyncContext(tenant: Tenant): Promise<{
    integration: ErpIntegrationRow;
    config: CatalogSyncConfigRow;
    state: CatalogSyncStateRow;
}> {
    return withTenantTransaction(tenant, SYSTEM_ACTOR, async (client) => {
        const integration = await findActiveErpIntegrationRow(client);
        if (!integration) throw new Error("ERP_INTEGRATION_NOT_CONFIGURED");
        const config = await findCatalogSyncConfigRow(client, integration.id);
        if (!config?.enabled) throw new Error("CATALOG_SYNC_NOT_CONFIGURED");
        const state = await ensureCatalogSyncStateRow(client, integration.id);
        return { integration, config, state };
    });
}

export async function syncTenantCatalog(
    tenant: Tenant,
    options: { mode?: CatalogSyncMode } = {},
): Promise<CatalogSyncResult> {
    const requestedMode = options.mode ?? "incremental";
    const { integration, config, state } = await loadSyncContext(tenant);
    const mode = chooseMode(requestedMode, state);
    const leaseToken = randomUUID();
    const acquired = await withTenantTransaction(tenant, SYSTEM_ACTOR, (client) =>
        acquireCatalogSyncLeaseRow(client, integration.id, leaseToken),
    );
    if (!acquired) {
        return { tenantId: tenant.id, integrationId: integration.id, mode, acquired: false, discovered: 0, processed: 0, failed: 0 };
    }

    let run: CatalogSyncRunRow | undefined;
    let discovered = 0;
    try {
        const openFullRun = mode === "full"
            ? await withTenantTransaction(tenant, SYSTEM_ACTOR, (client) =>
                findOpenFullCatalogSyncRunRow(client, integration.id),
            )
            : null;
        if (openFullRun && openFullRun.status !== "discovering") {
            const provider = createErpProvider(
                integration.provider,
                integration.credentials,
                createExternalApiCallReporter(tenant, SYSTEM_ACTOR, integration.provider),
            );
            const runtime: SyncRuntime = {
                tenant, integration, config, provider, run: openFullRun,
            };
            const itemResult = await processDueItems(runtime);
            return {
                tenantId: tenant.id,
                integrationId: integration.id,
                runId: openFullRun.id,
                mode: "full",
                acquired: true,
                discovered: 0,
                ...itemResult,
            };
        }
        if (openFullRun?.status === "discovering") {
            await withTenantTransaction(tenant, SYSTEM_ACTOR, (client) =>
                markCatalogSyncRunFailedRow(client, openFullRun.id, "Descoberta interrompida antes de concluir."),
            );
        }
        const windowEnd = new Date();
        const windowStart = mode === "incremental" && state.checkpoint_at
            ? new Date(state.checkpoint_at.getTime() - config.overlap_seconds * 1000)
            : undefined;
        run = await withTenantTransaction(tenant, SYSTEM_ACTOR, (client) =>
            insertCatalogSyncRunRow(client, {
                integrationId: integration.id, mode, windowStart, windowEnd,
            }),
        );
        const provider = createErpProvider(
            integration.provider,
            integration.credentials,
            createExternalApiCallReporter(tenant, SYSTEM_ACTOR, integration.provider),
        );
        const runtime: SyncRuntime = { tenant, integration, config, provider, run };

        const discoveryWindow: ErpProductChangeWindow = {
            ...(mode === "incremental" ? { startDate: windowStart, endDate: windowEnd } : {}),
            ...(config.classification_type_code !== null && config.classification_codes.length > 0
                ? { classificationTypeCode: config.classification_type_code, classificationCodes: config.classification_codes }
                : {}),
        };
        let cursor: string | undefined;
        do {
            const page = await provider.discoverProductChanges(discoveryWindow, cursor);
            discovered += await withTenantTransaction(tenant, SYSTEM_ACTOR, (client) =>
                stageCatalogSyncItemsRow(client, run!.id, integration.id, page.referenceCodes),
            );
            cursor = page.nextCursor;
        } while (cursor);

        await withTenantTransaction(tenant, SYSTEM_ACTOR, (client) =>
            markCatalogDiscoveryCompleteRow(client, {
                runId: run!.id,
                integrationId: integration.id,
                mode,
                checkpointAt: windowEnd,
                pollIntervalSeconds: config.poll_interval_seconds,
            }),
        );
        const itemResult = await processDueItems(runtime);
        return {
            tenantId: tenant.id,
            integrationId: integration.id,
            runId: run.id,
            mode,
            acquired: true,
            discovered,
            ...itemResult,
        };
    } catch (error) {
        if (run) {
            await withTenantTransaction(tenant, SYSTEM_ACTOR, (client) =>
                markCatalogSyncRunFailedRow(client, run!.id, errorMessage(error)),
            ).catch(() => undefined);
        }
        throw error;
    } finally {
        await withTenantTransaction(tenant, SYSTEM_ACTOR, (client) =>
            releaseCatalogSyncLeaseRow(client, integration.id, leaseToken),
        ).catch(() => undefined);
    }
}

interface DispatchTenantRow extends Tenant {
    next_incremental_at: Date | null;
}

export async function dispatchCatalogSync(input: {
    tenantId?: string;
    mode?: CatalogSyncMode;
} = {}): Promise<{ results: CatalogSyncResult[]; errors: Array<{ tenantId: string; error: string }> }> {
    const tenants = await withControlTransaction(async (client) => {
        const result = await client.query<DispatchTenantRow>(
            `SELECT tenant.id, tenant.slug, tenant.name, state.next_incremental_at
             FROM tenants tenant
             JOIN tenant_erp_integrations integration
               ON integration.tenant_id = tenant.id AND integration.active
             JOIN catalog_sync_configs config
               ON config.tenant_id = tenant.id AND config.integration_id = integration.id AND config.enabled
             LEFT JOIN catalog_sync_states state
               ON state.tenant_id = tenant.id AND state.integration_id = integration.id
             WHERE tenant.active AND tenant.status = 'active'
               AND ($1::uuid IS NOT NULL OR state.next_incremental_at IS NULL OR state.next_incremental_at <= now())
               AND ($1::uuid IS NULL OR tenant.id = $1)
             ORDER BY COALESCE(state.next_incremental_at, '-infinity'::timestamptz)
             LIMIT 100`,
            [input.tenantId ?? null],
        );
        return result.rows;
    });
    const results: CatalogSyncResult[] = [];
    const errors: Array<{ tenantId: string; error: string }> = [];
    for (const tenant of tenants) {
        try {
            results.push(await syncTenantCatalog(tenant, { mode: input.mode }));
        } catch (error) {
            errors.push({ tenantId: tenant.id, error: errorMessage(error) });
        }
    }
    return { results, errors };
}
