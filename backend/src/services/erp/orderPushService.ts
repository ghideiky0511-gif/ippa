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
import type { CartItem } from "@/contracts/shared";
import { logger, errorMeta } from "@/lib/logger";
import { createErpProviderForIntegration } from "@/services/erp/erpProviderFactory";
import { isNonRetryableErpOrderError, type ErpProvider } from "@/erp/types";
import { createExternalApiCallReporter } from "@/services/erp/externalApiLogService";
import { recordAuditEvent, PROVIDER_ORDER_AUDIT_ACTIONS, type AuditRequestContext } from "@/services/audit";
import { findActiveErpIntegrationRow, findErpIntegrationRowByProvider } from "@/models/erpIntegrationsModel";
import { findOrderRowById, listOrderItemRowsByOrder } from "@/models/ordersModel";
import { findOrderFreightRowByOrderId } from "@/models/orderFreightsModel";
import { findClientRow } from "@/models/clientsModel";
import { listProductVariantRowsByProductIds } from "@/models/catalogModel";
import { findExternalIdsByInternalIds } from "@/models/erpExternalReferencesModel";
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
    countSentProviderOrderAttempts,
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
            const provider = createErpProviderForIntegration(
                tenant, actor, integration,
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

// productCode do ERP por item do pedido -- indexado por item.key (chave por
// variante do carrinho), nunca por item.id (product_id, compartilhado entre
// variantes de cor/tamanho do mesmo produto: usar item.id faria dois
// tamanhos da mesma peça resolverem para o mesmo código, e o TOTVS Moda
// rejeita item duplicado num mesmo pedido -- ver mapOrderToTotvsModaOrderInDto).
// Resolve variante por (product_id, color, size), igual a
// assertOrderItemsInStock (services/orders/stockGate.ts), e então busca o
// código do ERP dessa variante em erp_external_references (populado pelo
// catalog sync, ver services/erp/catalogSyncService.processSku).
async function resolveErpProductCodesByItemKey(
    client: PoolClient,
    integrationId: string,
    items: CartItem[],
): Promise<Record<string, string>> {
    const relevantItems = items.filter((item) => item.color && item.size);
    if (relevantItems.length === 0) return {};

    const productIds = [...new Set(relevantItems.map((item) => item.id))];
    const variants = await listProductVariantRowsByProductIds(client, productIds);
    const variantByKey = new Map(variants.map((variant) => [`${variant.product_id}:${variant.color}:${variant.size}`, variant]));

    const variantIdByItemKey = new Map<string, string>();
    for (const item of relevantItems) {
        const variant = variantByKey.get(`${item.id}:${item.color}:${item.size}`);
        if (variant) variantIdByItemKey.set(item.key, variant.id);
    }

    const externalIdByVariantId = await findExternalIdsByInternalIds(
        client, integrationId, "product_variant", [...new Set(variantIdByItemKey.values())],
    );

    const result: Record<string, string> = {};
    for (const [itemKey, variantId] of variantIdByItemKey) {
        const externalId = externalIdByVariantId[variantId];
        if (externalId) result[itemKey] = externalId;
    }
    return result;
}

// Confere saldo ao vivo no ERP para cada productCode do pedido, em lote,
// logo antes de efetivamente criar o pedido lá -- a última chance de não
// mandar um item sem saldo, já que o gate de checkout (stockGate.ts) rodou
// no momento da compra, que pode ter sido bem antes deste dispatch (retry
// com backoff, resend manual). Simples e sem fallback de propósito: ao
// contrário de stockGate.refreshStockLive, que degrada pro saldo em cache
// se o ERP cair (para não travar a venda), aqui o pedido ainda não existe
// no ERP -- se a checagem falhar (sem saldo ou ERP fora do ar), a tentativa
// falha e cai no retry normal do motor, sem inventar uma resposta.
export async function assertProductCodesInStock(
    provider: Pick<ErpProvider, "fetchStock">,
    items: CartItem[],
    productCodesByItemKey: Record<string, string>,
): Promise<void> {
    const entries = items
        .map((item) => ({ item, productCode: productCodesByItemKey[item.key] }))
        .filter((entry): entry is { item: CartItem; productCode: string } => Boolean(entry.productCode) && entry.item.qty > 0);
    if (entries.length === 0) return;

    const productCodes = [...new Set(entries.map((entry) => entry.productCode))];
    const snapshots = await provider.fetchStock(productCodes);
    const stockByCode = new Map<string, number>();
    for (const snapshot of snapshots) {
        stockByCode.set(snapshot.skuExternalId, (stockByCode.get(snapshot.skuExternalId) ?? 0) + snapshot.quantity);
    }

    const insufficient = entries.filter((entry) => entry.item.qty > (stockByCode.get(entry.productCode) ?? 0));
    if (insufficient.length > 0) {
        throw new Error(
            `Estoque insuficiente no ERP para envio do pedido: ${insufficient
                .map((entry) => `${entry.item.name} (productCode ${entry.productCode})`)
                .join(", ")}.`,
        );
    }
}

// Código de integração humano-friendly do pedido no provider --
// {marca}{numero_do_pedido}_{versao}, ex. "BIPPA1042_01". A marca vem de
// APP_COMERCIAL_NAME_INTEGRATION -- separada de APP_COMERCIAL_NAME (nome
// comercial "de vitrine", pode ter espaço/acento) porque este campo vai
// direto num identificador de sistema no ERP; número é orders.order_number,
// sequencial por tenant. `version` é 1 + quantas vezes um pedido de VERDADE
// já foi criado no provider para este pedido local
// (countSentProviderOrderAttempts) -- só sobe depois de um
// cancelamento+recriação de fato (ver comentário sobre cancelar-antes-de-
// recriar em attemptProviderOrderPush), nunca num retry simples que ainda
// não chegou a criar nada lá. Manter o mesmo valor num retry simples é
// proposital: preserva a proteção de idempotência do orderId no TOTVS
// (reenviar a MESMA chamada não deve virar pedido duplicado lá -- ver
// comentário de idempotencyKey em erp/types.ts).
export function buildProviderOrderIdempotencyKey(orderNumber: number, version: number): string {
    const brand = (process.env.APP_COMERCIAL_NAME_INTEGRATION ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    return `${brand}${orderNumber}_${String(version).padStart(2, "0")}`;
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
    const provider = createErpProviderForIntegration(
        tenant, actor, integration,
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

        const [clientRow, productCodesByItemKey, sentCount] = await Promise.all([
            orderRow.client_id ? findClientRow(client, orderRow.client_id) : Promise.resolve(null),
            resolveErpProductCodesByItemKey(client, integration.id, items),
            countSentProviderOrderAttempts(client, row.order_id),
        ]);
        const context = { clientDocument: clientRow?.cpf_cnpj ?? undefined, productCodesByItemKey };

        await assertProductCodesInStock(provider, items, productCodesByItemKey);
        const idempotencyKey = buildProviderOrderIdempotencyKey(order.orderNumber, sentCount + 1);
        const result = await provider.sendOrder(order, context, { idempotencyKey });
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
