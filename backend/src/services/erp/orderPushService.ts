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
import { findOrderFreightRowByOrderId } from "@/models/orderFreightsModel";
import { findClientRow } from "@/models/clientsModel";
import { findProductReferenceIdsByIds } from "@/models/catalogModel";
import { toOrder } from "@/services/orders/orderMapper";
import {
    claimPendingProviderOrders,
    finishProviderOrderAttempt,
    findProviderOrderRowByOrderId,
    insertProviderOrderRow,
    markProviderOrderCancelled,
    markProviderOrderForResend,
    type ClaimedProviderOrderRow,
    type ProviderOrderRow,
    type ProviderOrderStatus,
} from "@/models/providerOrdersModel";
import {
    insertProviderOrderAttemptRow,
    listProviderOrderAttemptRowsByOrderId,
    type ProviderOrderAttemptOutcome,
    type ProviderOrderAttemptRow,
} from "@/models/providerOrderAttemptsModel";

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

// Cancelamento de PEDIDO (ver orderService.cancelOrder) -- síncrono, fora da
// fila de dispatch: diferente de um resend, aqui não há "tentar de novo
// depois" que faça sentido (o pedido já foi cancelado localmente, que é a
// fonte de verdade), então nunca lança para quem chamou -- mesmo espírito de
// enqueueOrderPush nunca propagar erro, só que aqui devolvendo o motivo pra
// virar um aviso não-bloqueante na UI em vez de só logar.
export async function cancelProviderOrderForOrder(
    tenant: Tenant,
    actor: Pick<AuthUser, "id" | "role" | "name">,
    orderId: string,
    auditRequestContext?: AuditRequestContext,
): Promise<{ cancelled: boolean; error?: string }> {
    try {
        return await withTenantTransaction(tenant, actor, async (client) => {
            const row = await findProviderOrderRowByOrderId(client, orderId);
            if (!row) return { cancelled: true };
            if (row.status === "processing") {
                return { cancelled: false, error: "Reenvio ao ERP em andamento — tente cancelar novamente em instantes." };
            }
            if (!row.external_id) {
                await markProviderOrderCancelled(client, orderId);
                return { cancelled: true };
            }
            const integration = await findErpIntegrationRowByProvider(client, row.provider);
            if (!integration) {
                return { cancelled: false, error: "Integração de ERP não encontrada para cancelar este pedido lá." };
            }
            const provider = createErpProvider(
                integration.provider, integration.credentials,
                createExternalApiCallReporter(tenant, actor, integration.provider),
            );
            if (!provider.cancelOrder) {
                return { cancelled: false, error: "Este provedor de ERP não suporta cancelamento de pedido." };
            }
            await provider.cancelOrder(row.external_id);
            await markProviderOrderCancelled(client, orderId);
            if (auditRequestContext) {
                await recordAuditEvent(client, {
                    action: PROVIDER_ORDER_AUDIT_ACTIONS.CANCEL_REQUESTED,
                    entityId: row.id,
                    actor,
                    context: auditRequestContext,
                    metadata: { orderId, provider: row.provider },
                });
            }
            return { cancelled: true };
        });
    } catch (error) {
        logger.error("ERP_ORDER_PUSH", "Falha ao cancelar pedido no ERP", { orderId, ...errorMeta(error) });
        return { cancelled: false, error: error instanceof Error ? error.message : "Falha ao cancelar no ERP." };
    }
}

export async function orderPushStatus(tenant: Tenant, actor: ActorContext, orderId: string): Promise<ProviderOrderRow | null> {
    return withTenantTransaction(tenant, actor, (client) => findProviderOrderRowByOrderId(client, orderId));
}

// Histórico de tentativas de dispatch deste pedido (migration 035) --
// diferente de orderPushStatus acima, que só devolve o estado ATUAL
// (provider_orders tem no máximo uma linha por pedido). Usado pela página
// de detalhe de pedido no frontend.
export async function listOrderPushHistory(tenant: Tenant, actor: ActorContext, orderId: string): Promise<ProviderOrderAttemptRow[]> {
    return withTenantTransaction(tenant, actor, (client) => listProviderOrderAttemptRowsByOrderId(client, orderId));
}

// Fecha uma tentativa de dispatch e, na mesma transação, grava a linha de
// histórico correspondente (migration 035) -- `finishProviderOrderAttempt`
// sozinho só atualiza o estado atual (sobrescreve), então sem isto o
// histórico de tentativas seria perdido a cada retry.
async function finishAndLogAttempt(
    client: PoolClient,
    row: ClaimedProviderOrderRow,
    value: {
        status: ProviderOrderStatus; externalId: string | null;
        payload?: Record<string, unknown>; response?: Record<string, unknown>; error?: string | null;
    },
): Promise<void> {
    await finishProviderOrderAttempt(client, row.id, value);
    const outcome: ProviderOrderAttemptOutcome =
        value.status === "sent" ? "sent"
        : value.status === "failed" ? "failed"
        : value.status === "cancelling" ? "retry_cancelling"
        : "retry_pending";
    await insertProviderOrderAttemptRow(client, {
        providerOrderId: row.id, orderId: row.order_id, provider: row.provider, attemptNumber: row.attempts,
        outcome, externalId: value.externalId, error: value.error ?? null,
        payload: value.payload, response: value.response,
    });
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
        await finishAndLogAttempt(client, row, {
            status: "failed", externalId: row.external_id, error: "ERP_INTEGRATION_NOT_FOUND",
        });
        return "failed";
    }
    const provider = createErpProvider(
        integration.provider, integration.credentials,
        createExternalApiCallReporter(tenant, actor, integration.provider),
    );
    if (!provider.sendOrder) {
        await finishAndLogAttempt(client, row, {
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
            await finishAndLogAttempt(client, row, {
                status: "failed", externalId: activeExternalId, error: "ORDER_NOT_FOUND",
            });
            return "failed";
        }
        const items = (await listOrderItemRowsByOrder(client, row.order_id)).map((item) => item.snapshot);
        const freightRow = await findOrderFreightRowByOrderId(client, row.order_id);
        const order = toOrder(orderRow, items, freightRow);

        const [clientRow, productReferenceIds] = await Promise.all([
            orderRow.client_id ? findClientRow(client, orderRow.client_id) : Promise.resolve(null),
            findProductReferenceIdsByIds(client, [...new Set(items.map((item) => item.id).filter(Boolean))]),
        ]);
        const context = { clientDocument: clientRow?.cpf_cnpj ?? undefined, productReferenceIds };

        const result = await provider.sendOrder(order, context, { idempotencyKey: order.id });
        await finishAndLogAttempt(client, row, {
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
        await finishAndLogAttempt(client, row, {
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
