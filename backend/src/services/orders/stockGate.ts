import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { Tenant } from "@/lib/db/tenant";
import type { CartItem } from "@/contracts/shared";
import { ValidationError } from "@/services/shared/errors";
import { listProductVariantRowsByProductIds } from "@/models/catalogModel";
import { findActiveErpIntegrationRow, type ErpIntegrationRow } from "@/models/erpIntegrationsModel";
import { findExternalIdByInternalId } from "@/models/erpExternalReferencesModel";
import { applyErpInventorySnapshotRow } from "@/models/inventorySyncModel";
import { createExternalApiCallReporter } from "@/services/erp/externalApiLogService";
import { createErpProviderForIntegration } from "@/services/erp/erpProviderFactory";
import { getStockForVariants, getStockForVariantsFresh, invalidateVariantStock } from "@/services/inventory/stockCacheService";
import { logger } from "@/lib/logger";

const SYSTEM_ACTOR = { role: "catalog_sync" } as const;

// "Bom o bastante" pra confiar no cache sem consultar o ERP ao vivo -- um
// hit mais recente que isso é, na prática, "acabou de ser confirmado".
// Mais velho que isso (ou miss) força uma checagem ao vivo antes de deixar
// o pedido fechar, porque essa é a última chance de pegar uma mudança de
// estoque antes de o pedido virar irreversível.
const FRESHNESS_MS = 5_000;

// Chamado logo depois que os itens de um pedido são carregados/congelados
// e antes de status virar "novo" (ver finalizeOrderSession, createCustomerOrder,
// confirmPayment) -- garante que o estoque foi revalidado no instante da
// finalização, não só "razoavelmente recente" (gate obrigatório pedido pelo
// usuário). Sem integração ERP ativa, não há autoridade de estoque pra
// consultar -- no-op, mesma regra que já rege trackInventory hoje.
export async function assertOrderItemsInStock(
    tenant: Tenant,
    client: PoolClient,
    items: CartItem[],
): Promise<void> {
    const relevantItems = items.filter((item) => item.qty > 0 && item.color && item.size);
    if (relevantItems.length === 0) return;

    const integration = await findActiveErpIntegrationRow(client);
    if (!integration) return;

    const productIds = [...new Set(relevantItems.map((item) => item.id))];
    const variants = await listProductVariantRowsByProductIds(client, productIds);
    const variantByKey = new Map(variants.map((variant) => [`${variant.product_id}:${variant.color}:${variant.size}`, variant]));

    const trackedItems = relevantItems
        .map((item) => ({ item, variant: variantByKey.get(`${item.id}:${item.color}:${item.size}`) }))
        .filter((entry): entry is { item: CartItem; variant: NonNullable<typeof entry.variant> } =>
            Boolean(entry.variant?.track_inventory),
        );
    if (trackedItems.length === 0) return;

    const variantIds = trackedItems.map((entry) => entry.variant.id);
    let stockByVariant = await getStockForVariantsFresh(tenant, client, variantIds, FRESHNESS_MS);

    const staleVariantIds = variantIds.filter((id) => !stockByVariant.has(id));
    if (staleVariantIds.length > 0) {
        stockByVariant = new Map([
            ...stockByVariant,
            ...(await refreshStockLive(tenant, client, integration, staleVariantIds)),
        ]);
    }

    const affectedItems = trackedItems.filter(
        (entry) => entry.item.qty > (stockByVariant.get(entry.variant.id) ?? 0),
    );
    if (affectedItems.length > 0) {
        throw new ValidationError(
            "STOCK_CHANGED",
            "O estoque de um ou mais itens mudou desde que foram adicionados ao carrinho.",
            affectedItems.map((entry) => ({
                productId: entry.item.id, color: entry.item.color, size: entry.item.size,
                requestedQty: entry.item.qty, availableQty: stockByVariant.get(entry.variant.id) ?? 0,
            })),
        );
    }
}

async function refreshStockLive(
    tenant: Tenant,
    client: PoolClient,
    integration: ErpIntegrationRow,
    variantIds: string[],
): Promise<Map<string, number>> {
    const skuByVariant = new Map<string, string>();
    for (const variantId of variantIds) {
        const externalId = await findExternalIdByInternalId(client, integration.id, "product_variant", variantId);
        if (externalId) skuByVariant.set(variantId, externalId);
    }
    if (skuByVariant.size === 0) return new Map();

    const provider = createErpProviderForIntegration(
        tenant, SYSTEM_ACTOR, integration,
        createExternalApiCallReporter(tenant, SYSTEM_ACTOR, integration.provider),
    );
    const runId = randomUUID();
    try {
        const snapshots = await provider.fetchStock([...skuByVariant.values()]);
        for (const [variantId, skuExternalId] of skuByVariant) {
            const entries = snapshots.filter((entry) => entry.skuExternalId === skuExternalId);
            for (const entry of entries) {
                await applyErpInventorySnapshotRow(client, {
                    provider: integration.provider,
                    integrationId: integration.id,
                    variantId,
                    skuExternalId,
                    locationExternalId: entry.locationExternalId,
                    locationName: entry.locationName,
                    quantity: entry.quantity,
                    runId,
                });
            }
        }
    } catch (error) {
        logger.error("stock-gate", "Checagem ao vivo falhou na finalização, usando último saldo conhecido", {
            tenantId: tenant.id,
            integrationId: integration.id,
            error: error instanceof Error ? error.message : String(error),
        });
        // ERP fora do ar no pior momento possível não deve travar toda venda
        // -- degrada pro último saldo conhecido (cache/Postgres, sem exigir
        // frescor) em vez de tratar a falha de rede como "sem estoque".
        // O gate ainda tentou revalidar (cumpriu a obrigação); só não travou
        // a loja inteira por uma instabilidade momentânea do ERP.
        return getStockForVariants(tenant, client, [...skuByVariant.keys()]);
    }
    // Invalida antes de reler é seguro aqui porque a própria transação
    // enxerga a escrita que acabou de fazer (mesma conexão) -- o risco de
    // recache de valor antigo por outro leitor concorrente existe, mas é
    // uma janela curta e rara (só ocorre quando o gate precisou ir ao ERP
    // ao vivo, o que já é o caminho raro dentro do caminho raro).
    await invalidateVariantStock(tenant, [...skuByVariant.keys()]);
    return getStockForVariantsFresh(tenant, client, [...skuByVariant.keys()], 0);
}
