// Motor de envio de pedidos ao ERP (outbound) -- agnóstico de provider: só
// conhece o contrato ErpProvider.sendOrder/cancelOrder (ver erp/types.ts) e
// a máquina de estados de provider_orders (migration 029). Nenhum código
// aqui sabe o que é TOTVS -- isso vive inteiramente em
// erp/providers/totvsmoda. Espelha o padrão de fila de
// services/notifications/pushNotificationService.ts: enqueue grava a linha
// e dispara um dispatch imediato "melhor esforço"; sem worker/cron novo no
// processo, a fila persistida é quem garante que uma falha no dispatch
// imediato não perde a tentativa (fica pending para o próximo gatilho).

import type { PoolClient } from "pg";
import type { Tenant, ActorContext } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import type { AuthUser } from "@/lib/types";
import { logger, errorMeta } from "@/lib/logger";
import { createErpProvider } from "@/erp/registry";
import { isNonRetryableErpOrderError } from "@/erp/types";
import { createExternalApiCallReporter } from "@/services/erp/externalApiLogService";
import { recordAuditEvent, PROVIDER_ORDER_AUDIT_ACTIONS, type AuditRequestContext } from "@/services/audit";
import { findActiveErpIntegrationRow, findErpIntegrationRowByProvider } from "@/models/erpIntegrationsModel";
import { findOrderRowById, listOrderItemRowsByOrder } from "@/models/ordersModel";
import { findClientRow } from "@/models/clientsModel";
import { findProductReferenceIdsByIds } from "@/models/catalogModel";
import { toOrder } from "@/services/orders/orderMapper";
import {
    claimPendingProviderOrders,
    finishProviderOrderAttempt,
    findProviderOrderRowByOrderId,
    insertProviderOrderRow,
    markProviderOrderForResend,
    type ClaimedProviderOrderRow,
    type ProviderOrderRow,
} from "@/models/providerOrdersModel";

const maxAttempts = Math.max(1, Number(process.env.ERP_ORDER_PUSH_MAX_ATTEMPTS ?? 5));

// Enfileira o pedido para envio ao ERP ativo do tenant. Silencioso (não
// lança) quando não há integração ERP ativa -- envio ao ERP é um recurso
// opcional por tenant, mesmo espírito de ERP_INTEGRATION_NOT_CONFIGURED em
// erpSyncService. Também nunca propaga outras falhas: o pedido já está
// pago quando isto é chamado (ver orderService/paymentService), então um
// erro aqui não pode derrubar a resposta do checkout -- mesmo critério de
// "nunca propaga erro" que externalApiLogService.registerProviderEventStandalone
// já usa para efeitos colaterais não-críticos.
export async function enqueueOrderPush(tenant: Tenant, actor: ActorContext, orderId: string): Promise<void> {
    try {
        const integration = await withTenantTransaction(tenant, actor, async (client) => {
            const active = await findActiveErpIntegrationRow(client);
            if (!active) return null;
            await insertProviderOrderRow(client, { integrationId: active.id, orderId, provider: active.provider });
            return active;
        });
        if (!integration) return;
        void dispatchOrderPushes(tenant, actor, 5).catch((error) =>
            logger.error("ERP_ORDER_PUSH", "Falha ao despachar envio imediato", { orderId, ...errorMeta(error) }),
        );
    } catch (error) {
        logger.error("ERP_ORDER_PUSH", "Falha ao enfileirar envio ao ERP", { orderId, ...errorMeta(error) });
    }
}

// Ponto de extensão genérico: qualquer fluxo que altere um pedido depois de
// já enviado (edição pós-pagamento, troca, ajuste -- nenhum existe ainda,
// ver orderItemSync.ts, edição de itens hoje só ocorre pré-pagamento) ou um
// reenvio manual/retry chama isto. Decide sozinho se precisa cancelar antes
// (linha tem external_id) ou só (re)enfileirar.
export async function requestProviderOrderResend(
    tenant: Tenant,
    actor: Pick<AuthUser, "id" | "role" | "name">,
    orderId: string,
    auditRequestContext?: AuditRequestContext,
): Promise<ProviderOrderRow | null> {
    const existing = await withTenantTransaction(tenant, actor, (client) => findProviderOrderRowByOrderId(client, orderId));
    if (!existing) {
        await enqueueOrderPush(tenant, actor, orderId);
    } else if (existing.status !== "processing") {
        await withTenantTransaction(tenant, actor, async (client) => {
            const updated = await markProviderOrderForResend(client, orderId);
            // Só audita quando de fato mudou algo E veio de uma requisição
            // de verdade (auditRequestContext) -- chamadas internas futuras
            // (ver comentário acima) não têm request/sessão pra anexar.
            if (updated && auditRequestContext) {
                await recordAuditEvent(client, {
                    action: PROVIDER_ORDER_AUDIT_ACTIONS.RESEND_REQUESTED,
                    entityId: updated.id,
                    actor,
                    context: auditRequestContext,
                    metadata: { orderId, provider: updated.provider },
                });
            }
        });
        void dispatchOrderPushes(tenant, actor, 5).catch((error) =>
            logger.error("ERP_ORDER_PUSH", "Falha ao despachar reenvio imediato", { orderId, ...errorMeta(error) }),
        );
    }
    // 'processing': dispatch já em andamento agora -- não mexe, só devolve o
    // estado atual para quem chamou decidir a mensagem ("já em andamento").
    return withTenantTransaction(tenant, actor, (client) => findProviderOrderRowByOrderId(client, orderId));
}

export async function orderPushStatus(tenant: Tenant, actor: ActorContext, orderId: string): Promise<ProviderOrderRow | null> {
    return withTenantTransaction(tenant, actor, (client) => findProviderOrderRowByOrderId(client, orderId));
}

async function attemptProviderOrderPush(
    client: PoolClient,
    tenant: Tenant,
    actor: ActorContext,
    row: ClaimedProviderOrderRow,
): Promise<"sent" | "retry" | "failed"> {
    // Busca a integração pelo PROVIDER da própria linha, não pela ativa do
    // tenant agora -- um resend precisa cancelar/criar no mesmo provider que
    // o pedido foi enviado originalmente, mesmo que o tenant já tenha
    // trocado de ERP entre o envio e este dispatch.
    const integration = await findErpIntegrationRowByProvider(client, row.provider);
    if (!integration) {
        await finishProviderOrderAttempt(client, row.id, {
            status: "failed", externalId: row.external_id, error: "ERP_INTEGRATION_NOT_FOUND",
        });
        return "failed";
    }
    const provider = createErpProvider(
        integration.provider, integration.credentials,
        createExternalApiCallReporter(tenant, actor, integration.provider),
    );
    if (!provider.sendOrder) {
        await finishProviderOrderAttempt(client, row.id, {
            status: "failed", externalId: row.external_id, error: "PROVIDER_DOES_NOT_SUPPORT_ORDER_PUSH",
        });
        return "failed";
    }

    let activeExternalId = row.external_id;
    try {
        if (row.previous_status === "cancelling" && activeExternalId) {
            if (!provider.cancelOrder) throw new Error("PROVIDER_DOES_NOT_SUPPORT_ORDER_CANCEL");
            await provider.cancelOrder(activeExternalId);
            // Cancelado no ERP: a partir daqui não há mais pedido nenhum lá.
            // Não fecha a tentativa ainda -- cancelar + criar contam como UMA
            // tentativa só, attempts/backoff refletem a passada inteira.
            activeExternalId = null;
        }

        const orderRow = await findOrderRowById(client, row.order_id);
        if (!orderRow) {
            await finishProviderOrderAttempt(client, row.id, {
                status: "failed", externalId: activeExternalId, error: "ORDER_NOT_FOUND",
            });
            return "failed";
        }
        const items = (await listOrderItemRowsByOrder(client, row.order_id)).map((item) => item.snapshot);
        const order = toOrder(orderRow, items);

        const [clientRow, productReferenceIds] = await Promise.all([
            orderRow.client_id ? findClientRow(client, orderRow.client_id) : Promise.resolve(null),
            findProductReferenceIdsByIds(client, [...new Set(items.map((item) => item.id).filter(Boolean))]),
        ]);
        const context = { clientDocument: clientRow?.cpf_cnpj ?? undefined, productReferenceIds };

        const result = await provider.sendOrder(order, context, { idempotencyKey: order.id });
        await finishProviderOrderAttempt(client, row.id, {
            status: "sent", externalId: result.externalId,
            payload: order as unknown as Record<string, unknown>, response: result.raw ?? {}, error: null,
        });
        return "sent";
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Falha definitiva (ex.: TOTVS recusou cancelar um pedido já aceito
        // na retaguarda): não tenta de novo, e sobretudo não segue para criar
        // um pedido novo por cima -- duplicaria reserva de estoque.
        const terminal = isNonRetryableErpOrderError(error) || row.attempts >= maxAttempts;
        const retryState = activeExternalId ? "cancelling" : "pending";
        await finishProviderOrderAttempt(client, row.id, {
            status: terminal ? "failed" : retryState, externalId: activeExternalId, error: message,
        });
        return terminal ? "failed" : "retry";
    }
}

export async function dispatchOrderPushes(
    tenant: Tenant,
    actor: ActorContext,
    limit = 20,
): Promise<{ processed: number; sent: number; failed: number }> {
    const claimed = await withTenantTransaction(tenant, actor, (client) =>
        claimPendingProviderOrders(client, Math.min(Math.max(limit, 1), 500)),
    );
    let sent = 0;
    let failed = 0;
    for (const row of claimed) {
        const outcome = await withTenantTransaction(tenant, actor, (client) => attemptProviderOrderPush(client, tenant, actor, row));
        if (outcome === "sent") sent += 1;
        else if (outcome === "failed") failed += 1;
    }
    return { processed: claimed.length, sent, failed };
}
