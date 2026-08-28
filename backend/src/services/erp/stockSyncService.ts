import { randomUUID } from "node:crypto";
import type { Tenant, ActorContext } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import { withControlTransaction } from "@/lib/db/control";
import { createErpProvider } from "@/erp/registry";
import { createExternalApiCallReporter } from "@/services/erp/externalApiLogService";
import { findActiveErpIntegrationRow, type ErpIntegrationRow } from "@/models/erpIntegrationsModel";
import {
    acquireStockSyncLeaseRow,
    ensureCatalogSyncStateRow,
    findCatalogSyncConfigRow,
    releaseStockSyncLeaseRow,
    updateStockCheckpointRow,
    type CatalogSyncConfigRow,
} from "@/models/catalogSyncModel";
import { findInternalIdByExternalId } from "@/models/erpExternalReferencesModel";
import { applyErpInventorySnapshotRow } from "@/models/inventorySyncModel";
import { invalidateVariantStock } from "@/services/inventory/stockCacheService";
import { errorMeta, logger } from "@/lib/logger";

const SYSTEM_ACTOR: ActorContext = { role: "catalog_sync" };

// Motor paralelo ao de catalogSyncService.ts -- descoberta diferente (saldo
// alterado numa janela de tempo via ErpProvider.fetchStockChanges, não o
// feed de mudança de produto) e cadência bem mais rápida (config.
// stock_poll_interval_seconds, default 60s vs. os 300s do catálogo
// completo). Lease própria (stock_lease_token/until) pra um full sync de
// catálogo longo nunca bloquear o poll de saldo, nem vice-versa.

export interface StockSyncResult {
    tenantId: string;
    integrationId: string;
    acquired: boolean;
    skipped?: "no_provider_support" | "not_configured";
    applied: number;
    unresolved: number;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export async function syncTenantStock(tenant: Tenant): Promise<StockSyncResult> {
    const { integration, config, state } = await withTenantTransaction(tenant, SYSTEM_ACTOR, async (client) => {
        const integrationRow = await findActiveErpIntegrationRow(client);
        if (!integrationRow) throw new Error("ERP_INTEGRATION_NOT_CONFIGURED");
        const configRow = await findCatalogSyncConfigRow(client, integrationRow.id);
        if (!configRow?.enabled) throw new Error("CATALOG_SYNC_NOT_CONFIGURED");
        const stateRow = await ensureCatalogSyncStateRow(client, integrationRow.id);
        return { integration: integrationRow, config: configRow, state: stateRow };
    });

    const provider = createErpProvider(
        integration.provider,
        integration.credentials,
        createExternalApiCallReporter(tenant, SYSTEM_ACTOR, integration.provider),
    );
    // Ausência não é falha -- provider sem esse método (ou ERP que não
    // expõe changeDate de saldo) simplesmente não participa do poll
    // dedicado; a sincronização de catálogo periódica continua cobrindo
    // saldo pra ele, só num ciclo mais lento.
    if (!provider.fetchStockChanges) {
        return { tenantId: tenant.id, integrationId: integration.id, acquired: false, skipped: "no_provider_support", applied: 0, unresolved: 0 };
    }

    const leaseToken = randomUUID();
    const acquired = await withTenantTransaction(tenant, SYSTEM_ACTOR, (client) =>
        acquireStockSyncLeaseRow(client, integration.id, leaseToken),
    );
    if (!acquired) {
        return { tenantId: tenant.id, integrationId: integration.id, acquired: false, applied: 0, unresolved: 0 };
    }

    let applied = 0;
    let unresolved = 0;
    let releaseError: string | undefined;
    try {
        const windowEnd = new Date();
        const windowStart = state.stock_checkpoint_at
            ? new Date(state.stock_checkpoint_at.getTime() - config.overlap_seconds * 1000)
            : new Date(windowEnd.getTime() - config.stock_poll_interval_seconds * 1000);
        const changes = await provider.fetchStockChanges({ startDate: windowStart, endDate: windowEnd });

        const touchedVariantIds: string[] = [];
        await withTenantTransaction(tenant, SYSTEM_ACTOR, async (client) => {
            for (const entry of changes) {
                const variantId = await findInternalIdByExternalId(client, integration.id, "product_variant", entry.skuExternalId);
                if (!variantId) {
                    // SKU ainda não conhecido localmente -- o sync de
                    // referência normal (catalogSyncService) é quem cria a
                    // variante na primeira vez; este poll só atualiza saldo
                    // do que já existe.
                    unresolved += 1;
                    continue;
                }
                await applyErpInventorySnapshotRow(client, {
                    provider: integration.provider,
                    integrationId: integration.id,
                    variantId,
                    skuExternalId: entry.skuExternalId,
                    locationExternalId: entry.locationExternalId,
                    locationName: entry.locationName,
                    quantity: entry.quantity,
                    runId: leaseToken,
                });
                touchedVariantIds.push(variantId);
                applied += 1;
            }
        });
        // Depois do commit, não antes -- mesmo motivo de processReference em
        // catalogSyncService.ts (evita recachear um valor que MVCC ainda
        // mostraria como o antigo).
        await invalidateVariantStock(tenant, touchedVariantIds);

        await withTenantTransaction(tenant, SYSTEM_ACTOR, (client) =>
            updateStockCheckpointRow(client, integration.id, windowEnd, config.stock_poll_interval_seconds),
        );
        return { tenantId: tenant.id, integrationId: integration.id, acquired: true, applied, unresolved };
    } catch (error) {
        releaseError = errorMessage(error);
        logger.error("stock-sync", "Poll de saldo dedicado falhou", {
            tenantId: tenant.id,
            integrationId: integration.id,
            ...errorMeta(error),
        });
        throw error;
    } finally {
        await withTenantTransaction(tenant, SYSTEM_ACTOR, (client) =>
            releaseStockSyncLeaseRow(client, integration.id, leaseToken, releaseError),
        ).catch(() => undefined);
    }
}

interface DispatchStockTenantRow extends Tenant {
    next_stock_poll_at: Date | null;
}

export async function dispatchStockSync(input: { tenantId?: string } = {}): Promise<{
    results: StockSyncResult[];
    errors: Array<{ tenantId: string; error: string }>;
}> {
    const tenants = await withControlTransaction(async (client) => {
        const result = await client.query<DispatchStockTenantRow>(
            `SELECT tenant.id, tenant.slug, tenant.name, state.next_stock_poll_at
             FROM tenants tenant
             JOIN tenant_erp_integrations integration
               ON integration.tenant_id = tenant.id AND integration.active
             JOIN catalog_sync_configs config
               ON config.tenant_id = tenant.id AND config.integration_id = integration.id AND config.enabled
             LEFT JOIN catalog_sync_states state
               ON state.tenant_id = tenant.id AND state.integration_id = integration.id
             WHERE tenant.active AND tenant.status = 'active'
               AND ($1::uuid IS NOT NULL OR state.next_stock_poll_at IS NULL OR state.next_stock_poll_at <= now())
               AND ($1::uuid IS NULL OR tenant.id = $1)
             ORDER BY COALESCE(state.next_stock_poll_at, '-infinity'::timestamptz)
             LIMIT 100`,
            [input.tenantId ?? null],
        );
        return result.rows;
    });
    const results: StockSyncResult[] = [];
    const errors: Array<{ tenantId: string; error: string }> = [];
    for (const tenant of tenants) {
        try {
            results.push(await syncTenantStock(tenant));
        } catch (error) {
            errors.push({ tenantId: tenant.id, error: errorMessage(error) });
        }
    }
    return { results, errors };
}

// Reexportado só pro tipo ficar disponível pra rota HTTP sem importar de
// erpIntegrationsModel diretamente lá.
export type { ErpIntegrationRow };
export type { CatalogSyncConfigRow };
