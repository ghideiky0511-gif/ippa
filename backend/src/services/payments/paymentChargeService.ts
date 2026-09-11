import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { ActorContext, Tenant } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant";
import { createPaymentProvider } from "@/payments/registry";
import type { ChargeResult, PaymentMethod, PaymentProvider, WebhookEvent } from "@/payments/types";
import { extractStripeCardTransactionDetails, extractStripeFailureMessage } from "@/payments/providers/stripe";
import { extractMercadoPagoCardTransactionDetails, extractMercadoPagoFailureMessage } from "@/payments/providers/mercadopago";
import { resolveProviderCredentials } from "./providerCredentials";
import { findActivePaymentIntegrationRow, type PaymentIntegrationRow } from "@/models/paymentIntegrationsModel";
import {
    applyPaymentChargeStatusByExternalId,
    applyPaymentChargeStatusById,
    insertPendingPaymentChargeRow,
    listLivePaymentChargeRowsByOrder,
    listOrphanLivePaymentChargeRows,
    markPaymentChargeCreatedRow,
    type PaymentChargeRow,
} from "@/models/paymentChargesModel";
import {
    findOrderRowById,
    listOrderItemRowsByOrder,
    listOrderItemSeparationRowsByOrder,
    updateOrderPaymentStatusRow,
    type OrderItemSeparationRow,
} from "@/models/ordersModel";
import { createExternalApiCallReporter } from "@/services/erp/externalApiLogService";
import { NotFoundError, ValidationError } from "@/services/shared/errors";
import { errorMeta, logger } from "@/lib/logger";
import type { OrderPaymentCharge, PaymentChargeMethod, PaymentChargeStatus } from "@/contracts/payments";

// Primeiro consumidor real de PaymentProvider (registry.ts) -- até aqui só
// o mock exercitava o contrato. createOrderCharge é o motor reutilizável de
// cobrança; qual tela de checkout chama ele é uma decisão em aberto (ver
// plano) -- este arquivo não assume nenhuma.

// Prontidão pra cobrar é diferente por provider: Stripe depende de um
// status de onboarding assíncrono (KYC via webhook, ver
// stripeWebhookService.ts); Mercado Pago não tem esse passo -- a troca do
// código OAuth já É a confirmação (ver mercadoPagoOnboardingService.ts), a
// própria ativação (`active = true`) já implica "pronto", só falta um
// access_token salvo. Mesmo padrão de ternário inline por provider já
// usado em paymentIntegrationService.ts::toOption.
export function isPaymentIntegrationReadyToCharge(row: PaymentIntegrationRow): boolean {
    if (row.provider === "stripe") {
        return Boolean(row.stripe_account_id) && row.stripe_onboarding_status === "complete";
    }
    if (row.provider === "mercadopago") {
        return Boolean((row.credentials as { accessToken?: string }).accessToken);
    }
    return false;
}

// Uma cobrança Pix "viva" só é candidata a reaproveitamento (ver
// createOrderCharge abaixo) quando ainda tem QR/copia-e-cola gravados, não
// expirou no provider e o valor não mudou desde que foi criada -- sem essa
// última checagem, um pedido editado entre um envio e outro reenviaria um
// código Pix com o valor errado. Pura/testável, mesmo padrão de
// assertOrderChargeable abaixo.
export function isReusableLivePixCharge(row: PaymentChargeRow, amount: number): boolean {
    return (
        row.method === "pix" &&
        Boolean(row.pix_copy_paste) &&
        Boolean(row.pix_qr_code) &&
        row.provider_expires_at !== null &&
        row.provider_expires_at.getTime() > Date.now() &&
        Number(row.amount) === amount
    );
}

export async function createOrderCharge(
    tenant: Tenant,
    actor: ActorContext,
    orderId: string,
    input: {
        method: PaymentMethod;
        customer: { name: string; document: string; email: string };
        cardToken?: string;
        installments?: number;
        paymentMethodId?: string;
        issuerId?: string;
        deviceId?: string;
    },
): Promise<ChargeResult> {
    const prepared = await withTenantTransaction(tenant, actor, async (client) => {
        const integrationRow = await findActivePaymentIntegrationRow(client);
        // Onboarding incompleto bloqueia a cobrança ANTES de qualquer chamada
        // ao provider -- falha rápido, sem depender do próprio provider rejeitar.
        if (!integrationRow || !isPaymentIntegrationReadyToCharge(integrationRow)) {
            throw new ValidationError(
                "PAYMENT_INTEGRATION_NOT_READY",
                "O gateway de pagamento deste tenant ainda não está pronto para cobrar (onboarding incompleto).",
            );
        }
        const order = await findOrderRowById(client, orderId);
        if (!order) throw new NotFoundError("ORDER_NOT_FOUND");

        const items = await listOrderItemSeparationRowsByOrder(client, orderId);
        assertOrderChargeable(items);

        const liveCharges = await listLivePaymentChargeRowsByOrder(client, orderId);

        // Snapshot (nome/preço) dos itens, só pra enriquecer o que o
        // provider mostra na tela de detalhes do pagamento (ver
        // CreateChargeInput.items) -- não confundir com `items` acima
        // (qty/qty_separated, usado só pra checar se o pedido pode ser
        // cobrado).
        const itemRows = await listOrderItemRowsByOrder(client, orderId);

        return {
            integrationRow,
            amount: Number(order.total),
            orderNumber: order.order_number,
            chargeItems: itemRows.map((row) => ({
                title: row.snapshot.name,
                quantity: row.snapshot.qty,
                unitPrice: row.snapshot.price,
            })),
            liveCharges,
        };
    });

    const credentials = await resolveProviderCredentials(tenant, actor, prepared.integrationRow);
    const provider = createPaymentProvider(
        prepared.integrationRow.provider,
        credentials,
        createExternalApiCallReporter(tenant, actor, prepared.integrationRow.provider),
    );

    // Pix é a única forma reaproveitável: o botão "Enviar pedido +
    // pagamento" do WhatsApp e o link de pagamento reaberto pela cliente
    // podem chamar createOrderCharge de novo pro MESMO pedido antes da
    // cobrança anterior ser paga. Sem reaproveitar, cada chamada cancela a
    // Pix viva e abre outra no provider -- no Mercado Pago isso cria uma
    // "venda" (Orders API) e dispara um e-mail novo a cada clique/reload,
    // mesmo que nada tenha mudado no pedido (confirmado em produção).
    // Cartão nunca reaproveita: cada tentativa carrega um cardToken novo do
    // Brick/Elements, que só serve pra uma cobrança.
    let reusablePixResult: ChargeResult | null = null;
    for (const liveCharge of prepared.liveCharges) {
        if (input.method === "pix" && !reusablePixResult && isReusableLivePixCharge(liveCharge, prepared.amount)) {
            const resolution = await resolveLiveChargeStatus(tenant, actor, provider, liveCharge);
            // racedTerminal: um webhook/reconciliação concorrente já marcou
            // esta linha num estado terminal entre a leitura acima e agora --
            // resolution.status (da consulta ao provider) pode estar
            // desatualizado nesse caso, então nunca reaproveita.
            if (!resolution.racedTerminal && (resolution.status === "pending" || resolution.status === "processing")) {
                reusablePixResult = {
                    method: "pix",
                    externalId: liveCharge.external_id ?? "",
                    qrCode: liveCharge.pix_qr_code!,
                    copyPaste: liveCharge.pix_copy_paste!,
                    expiresAt: liveCharge.provider_expires_at!,
                    raw: liveCharge.raw_create_response,
                };
            }
            // resolveLiveChargeStatus já persistiu o status (reaproveitada
            // continua 'pending'; senão já virou terminal) -- nunca cancela
            // aqui, diferente do caminho abaixo.
            continue;
        }
        // Regra "uma cobrança viva por pedido": antes de abrir uma tentativa
        // nova, toda tentativa anterior ainda em aberto (pending/processing/
        // authorized) precisa ter sido processada (consulta ao provider
        // resolve pra um estado terminal) ou cancelada -- nunca duas
        // tentativas vivas ao mesmo tempo. Lança ValidationError se alguma
        // não puder ser resolvida nem cancelada, bloqueando a nova tentativa
        // (mais seguro que permitir duas cobranças correndo pro mesmo
        // pedido).
        await resolveOrCancelLiveCharge(tenant, actor, provider, liveCharge);
    }
    if (reusablePixResult) return reusablePixResult;

    const chargeId = await withTenantTransaction(tenant, actor, async (client) => {
        // Grava a cobrança ANTES de chamar o provider (id gerado aqui) -- se
        // o webhook chegar antes desta função terminar, ele já encontra a
        // linha via metadata.charge_id (ver applyPaymentChargeWebhookEvent).
        // É também esta linha que mercadoPagoWebhookService.ts usa pra
        // resolver o tenant a partir de um payment_id, uma vez que
        // markPaymentChargeCreatedRow grave o external_id abaixo.
        const chargeRow = await insertPendingPaymentChargeRow(client, {
            id: randomUUID(),
            integrationId: prepared.integrationRow.id,
            provider: prepared.integrationRow.provider,
            orderId,
            method: input.method,
            amount: prepared.amount,
        });
        return chargeRow.id;
    });

    let result: ChargeResult;
    try {
        result = await provider.createCharge({
            amount: prepared.amount,
            method: input.method,
            orderId,
            orderNumber: prepared.orderNumber,
            items: prepared.chargeItems,
            customer: input.customer,
            cardToken: input.cardToken,
            installments: input.installments,
            paymentMethodId: input.paymentMethodId,
            issuerId: input.issuerId,
            deviceId: input.deviceId,
            internalChargeId: chargeId,
        });
    } catch (exc) {
        logger.error("payment-charge", "Falha ao criar cobrança no provider", {
            tenantId: tenant.id,
            orderId,
            chargeId,
            provider: prepared.integrationRow.provider,
            ...errorMeta(exc),
        });
        // Nunca deixa o pedido em limbo mesmo numa falha de rede/API antes de
        // qualquer resposta -- é a mesma garantia que uma resposta "failed"
        // normal do provider recebe logo abaixo.
        await withTenantTransaction(tenant, actor, async (client) => {
            await markPaymentChargeCreatedRow(client, {
                id: chargeId,
                externalId: null,
                status: "failed",
                rawCreateResponse: { error: exc instanceof Error ? exc.message : String(exc) },
            });
            await updateOrderPaymentStatusRow(client, orderId, { paymentStatus: "payment_failed" });
        });
        // Pix/boleto não têm um ChargeResult "falhou" (o tipo assume criação
        // bem-sucedida, ver payments/types.ts) -- lançar é a única opção
        // honesta pra esses métodos, a rota devolve um erro de verdade em
        // vez de um 200 fingindo sucesso. Só cartão tem o formato "falhou"
        // pra devolver, mesmo raciocínio de sempre pra esse método.
        if (input.method !== "cartao") {
            throw new ValidationError(
                "PAYMENT_CHARGE_FAILED",
                "Não foi possível gerar a cobrança. Tente novamente em instantes.",
            );
        }
        // Nunca relança o erro cru do provider: ele não é um dos tipos que
        // apiHelpers.ts::serviceError reconhece, então a rota devolveria um
        // 500 sem corpo (o cliente via "Unexpected end of JSON input" em vez
        // de uma mensagem). Um erro de cartão reconhecido (StripeCardError)
        // é seguro de mostrar; qualquer outro tipo (ex. resource_missing por
        // um PaymentMethod criado no contexto de conta errado) é um bug
        // nosso, não algo que o cliente causou.
        const isRecognizedCardDecline =
            prepared.integrationRow.provider === "stripe" && (exc as { type?: string })?.type === "StripeCardError";
        return {
            method: "cartao",
            externalId: "",
            status: "failed",
            failureReason:
                isRecognizedCardDecline && exc instanceof Error
                    ? exc.message
                    : "Não foi possível processar o pagamento. Tente novamente em instantes.",
            raw: {},
        };
    }

    await withTenantTransaction(tenant, actor, async (client) => {
        if (result.method === "cartao") {
            await markPaymentChargeCreatedRow(client, {
                id: chargeId,
                externalId: result.externalId || null,
                status: result.status === "authorized" ? "authorized" : "failed",
                cardLastDigits: result.lastDigits,
                cardBrand: result.brand,
                rawCreateResponse: result.raw,
            });
            // "authorized" ainda não é "paid" (mesma distinção do enum
            // payment_charge_status): o pagamento síncrono some definitivo
            // quando o webhook (ou reconciliação) confirma, e é quem grava
            // paid_at -- ver applyPaymentChargeWebhookEvent abaixo. Falha
            // síncrona, porém, é definitiva aqui mesmo (requisito "sem
            // limbo" no caminho síncrono).
            await updateOrderPaymentStatusRow(client, orderId, {
                paymentStatus: result.status === "authorized" ? "awaiting_confirmation" : "payment_failed",
            });
        } else if (result.method === "pix") {
            await markPaymentChargeCreatedRow(client, {
                id: chargeId,
                externalId: result.externalId || null,
                status: "pending",
                pixQrCode: result.qrCode,
                pixCopyPaste: result.copyPaste,
                providerExpiresAt: result.expiresAt,
                rawCreateResponse: result.raw,
            });
            // Diferente do cartão, um Pix recém-criado ainda não foi pago
            // pela cliente -- não move orders.payment_status aqui (fica
            // como estava, tipicamente 'unpaid'); só avança quando o
            // webhook/reconciliação confirma 'authorized'/'paid' (mesma
            // regra de mapChargeStatusToOrderPaymentUpdate: 'pending' não
            // move a trilha financeira do pedido).
        } else {
            // boleto: guard de tipo só -- ambos os providers lançam antes
            // de chegar aqui (fora de escopo), nunca alcançado na prática.
            await markPaymentChargeCreatedRow(client, {
                id: chargeId,
                externalId: result.externalId || null,
                status: "pending",
                rawCreateResponse: result.raw,
            });
        }
    });

    return result;
}

// Consulta o estado real no provider e persiste (idempotente via
// applyPaymentChargeWebhookEvent) -- não cancela nada, só resolve. Usada
// tanto por resolveOrCancelLiveCharge (que decide cancelar em seguida)
// quanto pelo caminho de reaproveitamento de Pix em createOrderCharge (que
// decide reaproveitar em vez de cancelar). Nunca chama a API dentro de uma
// transação de tenant (mesmo padrão do resto do arquivo: transação só ao
// redor do trabalho de banco, chamada de rede sempre fora).
async function resolveLiveChargeStatus(
    tenant: Tenant,
    actor: ActorContext,
    provider: PaymentProvider,
    row: PaymentChargeRow,
): Promise<{ status: PaymentChargeStatus; racedTerminal: boolean }> {
    if (!row.external_id) {
        // Nunca chegou a chamar o provider (ex. processo caiu entre
        // insertPendingPaymentChargeRow e a chamada de criação) -- não há
        // nada pra reconciliar nem reaproveitar do lado de lá.
        await withTenantTransaction(tenant, actor, (client) =>
            applyPaymentChargeStatusById(client, row.id, {
                status: "cancelled",
                rawLastWebhook: { cancelled_reason: "superseded_before_provider_call" },
            }),
        );
        return { status: "cancelled", racedTerminal: false };
    }

    const event = await provider.fetchChargeStatus(row.external_id);
    const resolved = await withTenantTransaction(tenant, actor, (client) =>
        applyPaymentChargeWebhookEvent(client, row.provider, event),
    );
    // resolved === null: a linha já estava num estado terminal (corrida com
    // um webhook/reconciliação concorrente) -- event.status pode estar
    // desatualizado nesse caso, então quem chama nunca deve confiar nele.
    return { status: event.status, racedTerminal: !resolved };
}

// Cancela uma tentativa de cobrança que ainda está em aberto para o pedido
// -- chamada uma vez por linha "viva" encontrada, ANTES de createOrderCharge
// abrir uma tentativa nova (ver comentário acima), exceto pra uma Pix
// reaproveitada (essa nunca passa por aqui).
async function resolveOrCancelLiveCharge(
    tenant: Tenant,
    actor: ActorContext,
    provider: PaymentProvider,
    row: PaymentChargeRow,
): Promise<void> {
    const { status, racedTerminal } = await resolveLiveChargeStatus(tenant, actor, provider, row);
    if (racedTerminal) return;
    // fetchChargeStatus só devolve pending/processing/paid/failed/cancelled
    // (nunca "authorized" -- ver mapPaymentIntentStatus); paid/failed/
    // cancelled/expired já são terminais, então só pending/processing ainda
    // contam como "viva" depois da reconciliação. Sem external_id, o status
    // já veio "cancelled" de resolveLiveChargeStatus e cai aqui.
    if (status !== "pending" && status !== "processing") return;
    // Chegar aqui com status pending/processing implica external_id != null
    // -- resolveLiveChargeStatus só devolve esse status quando a linha
    // TINHA external_id (o ramo sem external_id sempre devolve "cancelled").
    const externalId = row.external_id!;

    if (!provider.cancelCharge) {
        throw new ValidationError(
            "ORDER_HAS_PENDING_CHARGE",
            "Já existe uma tentativa de cobrança em andamento para este pedido e este gateway não permite cancelá-la automaticamente. Aguarde a confirmação antes de tentar novamente.",
        );
    }
    try {
        await provider.cancelCharge(externalId);
    } catch (exc) {
        logger.error("payment-charge", "Falha ao cancelar tentativa de cobrança anterior", {
            tenantId: tenant.id,
            orderId: row.order_id,
            chargeId: row.id,
            ...errorMeta(exc),
        });
        throw new ValidationError(
            "ORDER_HAS_PENDING_CHARGE",
            "Não foi possível cancelar a tentativa de cobrança anterior deste pedido. Aguarde alguns instantes e tente novamente.",
        );
    }
    await withTenantTransaction(tenant, actor, (client) =>
        applyPaymentChargeStatusById(client, row.id, {
            status: "cancelled",
            rawLastWebhook: { cancelled_reason: "superseded_by_new_attempt" },
        }),
    );
}

// Regra de negócio "sem separação, sem cobrança" (ver comentário de
// OrderStatusSchema em contracts/orders.ts: 'pago' só é alcançável a partir
// de 'separado'). Checa direto qty x qty_separated em vez de orders.status
// porque nada ainda escreve status='separado' (a transição fica para o
// serviço de fulfillment do Bippa) -- qty_separated é o fato físico real.
// Extraída pra ser testável sem banco, mesmo padrão de
// mapChargeStatusToOrderPaymentUpdate abaixo.
export function assertOrderChargeable(items: OrderItemSeparationRow[]): void {
    if (items.length === 0) {
        throw new ValidationError("ORDER_HAS_NO_ITEMS", "O pedido não tem itens e não pode ser cobrado.");
    }
    const pending = items.some((item) => item.qty_separated < item.qty);
    if (pending) {
        throw new ValidationError(
            "ORDER_ITEMS_NOT_SEPARATED",
            "Os itens do pedido ainda não foram confirmados como separados. Confirme a separação física antes de cobrar.",
        );
    }
}

// Um provider novo só precisa de uma entrada nesses dois mapas -- é o que
// mantém toOrderPaymentCharge abaixo sem nenhum `if (provider === "stripe")`
// espalhado (pedido explícito: a UI não pode ficar travada ao Stripe).
const CARD_DETAIL_EXTRACTORS: Record<string, (raw: Record<string, unknown>) => { nsu?: string; installments: number }> = {
    stripe: extractStripeCardTransactionDetails,
    mercadopago: extractMercadoPagoCardTransactionDetails,
};

const FAILURE_MESSAGE_EXTRACTORS: Record<string, (raw: Record<string, unknown>) => string | undefined> = {
    stripe: extractStripeFailureMessage,
    mercadopago: extractMercadoPagoFailureMessage,
};

// Mapeia uma linha de payment_charges pro formato de EXIBIÇÃO
// provider-agnóstico (ver contracts/payments.ts) -- é o que
// OrderPaymentDetails.tsx (mesmo componente no workspace e na tela da
// cliente) consome. card_last_digits/card_brand já são colunas próprias
// (gravadas por markPaymentChargeCreatedRow); NSU/parcelas exigem
// interpretar o JSON bruto do provider, daí o dispatch acima. Extraída
// pra ser testável sem banco, mesmo padrão de mapChargeStatusToOrderPaymentUpdate.
export function toOrderPaymentCharge(row: PaymentChargeRow): OrderPaymentCharge {
    const isFailed = row.status === "failed" || row.status === "expired" || row.status === "cancelled";
    const extractFailure = FAILURE_MESSAGE_EXTRACTORS[row.provider];
    return {
        id: row.id,
        provider: row.provider,
        method: row.method as PaymentChargeMethod,
        status: row.status as PaymentChargeStatus,
        amount: Number(row.amount),
        createdAt: row.created_at.toISOString(),
        paidAt: row.paid_at ? row.paid_at.toISOString() : null,
        failureReason: isFailed
            ? extractFailure?.(row.raw_create_response) ?? extractFailure?.(row.raw_last_webhook)
            : undefined,
        card: row.method === "cartao"
            ? {
                lastDigits: row.card_last_digits ?? undefined,
                brand: row.card_brand ?? undefined,
                ...(CARD_DETAIL_EXTRACTORS[row.provider]?.(row.raw_create_response) ?? { installments: 1 }),
            }
            : undefined,
        // Só preenchido enquanto houver QR/copia-e-cola gravados (ver
        // markPaymentChargeCreatedRow) -- útil sobretudo enquanto
        // status === 'pending' (a cliente ainda não pagou), mas devolvido
        // também depois de terminal (inofensivo, a UI decide se exibe).
        pix: row.method === "pix" && row.pix_qr_code && row.pix_copy_paste
            ? {
                qrCode: row.pix_qr_code,
                copyPaste: row.pix_copy_paste,
                expiresAt: (row.provider_expires_at ?? row.created_at).toISOString(),
            }
            : undefined,
    };
}

export function extractInternalChargeId(raw: Record<string, unknown>): string | undefined {
    const metadata = raw.metadata as Record<string, unknown> | undefined;
    const value = metadata?.charge_id;
    return typeof value === "string" && value ? value : undefined;
}

// Lógica pura de tradução status de payment_charges -> transição de
// orders.payment_status (+ orders.status quando o pagamento é quem deve
// empurrar o pedido adiante), extraída pra ser testável sem banco. null =
// status que não move a trilha financeira do pedido (ex. "pending" antes de
// qualquer autorização). "paid" avança orders.status até 'pago' -- é a
// mesma transição que "Marcar como pago" faz manualmente, só que disparada
// pela confirmação real do gateway (ver updateOrderPaymentStatusRow).
export function mapChargeStatusToOrderPaymentUpdate(
    status: string,
): { paymentStatus: "paid" | "payment_failed" | "awaiting_confirmation"; advanceStatusTo?: "novo" | "pago" } | null {
    if (status === "paid") return { paymentStatus: "paid", advanceStatusTo: "pago" };
    if (status === "failed" || status === "cancelled" || status === "expired") {
        return { paymentStatus: "payment_failed" };
    }
    if (status === "authorized" || status === "processing") return { paymentStatus: "awaiting_confirmation" };
    return null;
}

// Alimentado tanto por stripeWebhookService.ts (evento verificado, já
// dentro de uma transação de tenant) quanto por
// paymentReconciliationService.ts (resultado de fetchChargeStatus) -- os
// dois produzem o mesmo WebhookEvent normalizado (ver payments/types.ts),
// então convergem numa função só. Retorna null quando não há cobrança pra
// atualizar (estado já terminal -- idempotência via
// applyPaymentChargeStatus{ByExternalId,ById}'s WHERE status NOT IN (...) --
// ou cobrança de fato desconhecida).
export async function applyPaymentChargeWebhookEvent(
    client: PoolClient,
    provider: string,
    event: WebhookEvent,
): Promise<{ chargeId: string; orderId: string } | null> {
    let charge = await applyPaymentChargeStatusByExternalId(client, provider, event.externalId, {
        status: event.status,
        externalStatus: event.type,
        rawLastWebhook: event.raw,
    });
    if (!charge) {
        const internalChargeId = extractInternalChargeId(event.raw);
        if (internalChargeId) {
            charge = await applyPaymentChargeStatusById(client, internalChargeId, {
                status: event.status,
                externalStatus: event.type,
                rawLastWebhook: event.raw,
            });
        }
    }
    if (!charge) return null;

    const orderUpdate = mapChargeStatusToOrderPaymentUpdate(charge.status);
    if (orderUpdate) await updateOrderPaymentStatusRow(client, charge.order_id, orderUpdate);
    // Regra "uma cobrança viva por pedido" (ver createOrderCharge acima):
    // createOrderCharge só checa tentativas anteriores ANTES de abrir uma
    // nova. Sem isto aqui, uma tentativa anterior que nunca chega a um
    // estado terminal (ex. falha de rede impediu markPaymentChargeCreatedRow
    // de gravar 'failed', ou o pedido nunca sofre uma nova tentativa depois
    // de pago) fica "viva" pra sempre mesmo com o pedido já pago -- é
    // exatamente o que este bloco fecha, cancelando qualquer irmã ainda
    // viva no exato momento em que UMA tentativa confirma 'paid'.
    if (charge.status === "paid") await cancelSiblingLiveOrderCharges(client, charge.order_id, charge.id);
    return { chargeId: charge.id, orderId: charge.order_id };
}

async function cancelSiblingLiveOrderCharges(client: PoolClient, orderId: string, keepChargeId: string): Promise<void> {
    const liveCharges = await listLivePaymentChargeRowsByOrder(client, orderId);
    for (const sibling of liveCharges) {
        if (sibling.id === keepChargeId) continue;
        await applyPaymentChargeStatusById(client, sibling.id, {
            status: "cancelled",
            rawLastWebhook: { cancelled_reason: "order_already_paid" },
        });
    }
}

// Reparo pontual para pedidos que já ficaram 'paid' ANTES da cancelSiblingLiveOrderCharges
// acima existir -- cobranças concorrentes/anteriores que nunca foram
// canceladas continuam "vivas" na tabela mesmo com o pedido já pago hoje.
// Não é chamada por nenhum fluxo de requisição; uso é manual (ver
// scripts/testar-reparar-cobrancas-orfas.ts). Devolve quantas linhas foram
// canceladas.
export async function cancelOrphanLiveChargesForPaidOrders(client: PoolClient): Promise<number> {
    const orphanRows = await listOrphanLivePaymentChargeRows(client);
    for (const row of orphanRows) {
        await applyPaymentChargeStatusById(client, row.id, {
            status: "cancelled",
            rawLastWebhook: { cancelled_reason: "order_already_paid_backfill" },
        });
    }
    return orphanRows.length;
}
