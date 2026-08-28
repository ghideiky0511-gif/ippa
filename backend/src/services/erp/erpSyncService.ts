import type { Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser } from "@/lib/types";
import { createExternalApiCallReporter } from "@/services/erp/externalApiLogService";
import { createErpProviderForIntegration } from "@/services/erp/erpProviderFactory";
import { insertCompanyRow, updateCompanyRow } from "@/models/companiesModel";
import { insertProductRow, updateProductRow, type ProductWriteRow } from "@/models/catalogModel";
import { insertClientRow, updateClientRow } from "@/models/clientsModel";
import { findInternalIdByExternalId, upsertExternalReferenceRow, type ErpEntityType } from "@/models/erpExternalReferencesModel";
import { findActiveErpIntegrationRow } from "@/models/erpIntegrationsModel";
import { insertOrderRow, upsertOrderItemRow } from "@/models/ordersModel";

export interface ErpSyncResultItem {
    externalId: string;
    internalId: string;
    created: boolean;
}

export interface ErpSyncResult {
    provider: string;
    items: ErpSyncResultItem[];
}

// Nenhuma das quatro funções abaixo registra audit_events por registro
// sincronizado (só a troca de provider, em erpIntegrationService, é
// auditada) — um sync pode trazer centenas de itens, e um evento de
// auditoria por item viraria ruído; CRUD manual (services/companies,
// services/clients) continua auditado normalmente.

export async function syncTenantCompanies(tenant: Tenant, actor: AuthUser): Promise<ErpSyncResult> {
    return withTenantTransaction(tenant, actor, async (client) => {
        const integration = await findActiveErpIntegrationRow(client);
        if (!integration) throw new Error("ERP_INTEGRATION_NOT_CONFIGURED");
        const provider = createErpProviderForIntegration(
            tenant, actor, integration,
            createExternalApiCallReporter(tenant, actor, integration.provider),
        );
        const { items } = await provider.getCompanies();

        const results: ErpSyncResultItem[] = [];
        for (const { externalId, data } of items) {
            const entityType: ErpEntityType = "company";
            const existingId = await findInternalIdByExternalId(client, integration.id, entityType, externalId);
            const row = existingId
                ? (await updateCompanyRow(client, existingId, data)) ?? await insertCompanyRow(client, data)
                : await insertCompanyRow(client, data);
            await upsertExternalReferenceRow(client, { integrationId: integration.id, entityType, internalId: row.id, externalId });
            results.push({ externalId, internalId: row.id, created: !existingId });
        }
        return { provider: integration.provider, items: results };
    });
}

export async function syncTenantClients(tenant: Tenant, actor: AuthUser): Promise<ErpSyncResult> {
    return withTenantTransaction(tenant, actor, async (client) => {
        const integration = await findActiveErpIntegrationRow(client);
        if (!integration) throw new Error("ERP_INTEGRATION_NOT_CONFIGURED");
        const provider = createErpProviderForIntegration(
            tenant, actor, integration,
            createExternalApiCallReporter(tenant, actor, integration.provider),
        );
        const { items } = await provider.getClients();

        const results: ErpSyncResultItem[] = [];
        for (const { externalId, data } of items) {
            const entityType: ErpEntityType = "client";
            const existingId = await findInternalIdByExternalId(client, integration.id, entityType, externalId);
            const row = existingId
                ? await updateClientRow(client, existingId, data) ?? await insertClientRow(client, data)
                : await insertClientRow(client, data);
            await upsertExternalReferenceRow(client, { integrationId: integration.id, entityType, internalId: row.id, externalId });
            results.push({ externalId, internalId: row.id, created: !existingId });
        }
        return { provider: integration.provider, items: results };
    });
}

export async function syncTenantProducts(tenant: Tenant, actor: AuthUser): Promise<ErpSyncResult> {
    return withTenantTransaction(tenant, actor, async (client) => {
        const integration = await findActiveErpIntegrationRow(client);
        if (!integration) throw new Error("ERP_INTEGRATION_NOT_CONFIGURED");
        const provider = createErpProviderForIntegration(
            tenant, actor, integration,
            createExternalApiCallReporter(tenant, actor, integration.provider),
        );
        const { items } = await provider.getProducts();

        const results: ErpSyncResultItem[] = [];
        for (const { externalId, data } of items) {
            const entityType: ErpEntityType = "product";
            const writeRow: ProductWriteRow = {
                name: data.name,
                description: data.description,
                referenceId: data.referenceId,
                price: data.price,
                suggestedRetailPrice: data.suggestedRetailPrice,
                markup: data.markup,
            };
            const existingId = await findInternalIdByExternalId(client, integration.id, entityType, externalId);
            const row = existingId
                ? await updateProductRow(client, existingId, writeRow) ?? await insertProductRow(client, writeRow)
                : await insertProductRow(client, writeRow);
            await upsertExternalReferenceRow(client, { integrationId: integration.id, entityType, internalId: row.id, externalId });
            results.push({ externalId, internalId: row.id, created: !existingId });
        }
        return { provider: integration.provider, items: results };
    });
}

// Pedidos são imutáveis (ver ordersModel.insertOrderRow): um external_id já
// reconciliado é pulado, nunca reescrito.
export async function syncTenantOrders(tenant: Tenant, actor: AuthUser): Promise<ErpSyncResult> {
    return withTenantTransaction(tenant, actor, async (client) => {
        const integration = await findActiveErpIntegrationRow(client);
        if (!integration) throw new Error("ERP_INTEGRATION_NOT_CONFIGURED");
        const provider = createErpProviderForIntegration(
            tenant, actor, integration,
            createExternalApiCallReporter(tenant, actor, integration.provider),
        );
        const { items } = await provider.getOrders();

        const results: ErpSyncResultItem[] = [];
        for (const { externalId, data } of items) {
            const entityType: ErpEntityType = "order";
            const existingId = await findInternalIdByExternalId(client, integration.id, entityType, externalId);
            if (existingId) {
                results.push({ externalId, internalId: existingId, created: false });
                continue;
            }
            const order = await insertOrderRow(client, {
                clientId: data.clientId,
                sellerId: data.sellerId,
                clientName: data.clientName,
                channel: data.channel,
                total: data.total,
                paymentMethod: data.paymentMethod,
                discount: data.discount,
                createdAt: data.date,
            });
            for (const item of data.items) await upsertOrderItemRow(client, order.id, item);
            await upsertExternalReferenceRow(client, { integrationId: integration.id, entityType, internalId: order.id, externalId });
            results.push({ externalId, internalId: order.id, created: true });
        }
        return { provider: integration.provider, items: results };
    });
}
