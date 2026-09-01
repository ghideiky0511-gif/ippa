import type { PoolClient } from "pg";

// CRUD sobre payment_charges (migration 044) -- usado por
// paymentChargeService.ts (criação síncrona) e stripeWebhookService.ts/
// paymentReconciliationService.ts (aplicação de status assíncrona). O
// desenho central é o WHERE status NOT IN (...) nas duas funções de
// "aplicar status": um estado terminal nunca regride, não importa quantas
// vezes ou em que ordem um evento chegue -- essa trava, não o log de
// webhook, é quem garante idempotência de verdade (ver stripeWebhookService.ts).

export interface PaymentChargeRow {
    id: string;
    tenant_id: string;
    integration_id: string;
    provider: string;
    order_id: string;
    method: string;
    status: string;
    amount: string;
    external_id: string | null;
    external_status: string | null;
    card_last_digits: string | null;
    card_brand: string | null;
    raw_create_response: Record<string, unknown>;
    raw_last_webhook: Record<string, unknown>;
    next_check_at: Date | null;
    paid_at: Date | null;
    created_at: Date;
    updated_at: Date;
}

const chargeFields =
    "id, tenant_id, integration_id, provider, order_id, method, status, amount, external_id, external_status, card_last_digits, card_brand, raw_create_response, raw_last_webhook, next_check_at, paid_at, created_at, updated_at";

// Grava a linha ANTES de chamar o provider (id gerado pela aplicação) --
// resolve a corrida onde o webhook pode chegar antes da chamada de criação
// retornar: a linha (e seu id) já existe e está commitada, então o webhook
// sempre tem uma chave de busca válida (ver applyPaymentChargeStatusById
// abaixo), mesmo sem external_id ainda preenchido.
export async function insertPendingPaymentChargeRow(
    client: PoolClient,
    value: { id: string; integrationId: string; provider: string; orderId: string; method: string; amount: number },
): Promise<PaymentChargeRow> {
    const result = await client.query<PaymentChargeRow>(
        `INSERT INTO payment_charges (id, tenant_id, integration_id, provider, order_id, method, status, amount)
         VALUES ($1, app_tenant_id(), $2, $3, $4, $5, 'pending', $6)
         RETURNING ${chargeFields}`,
        [value.id, value.integrationId, value.provider, value.orderId, value.method, value.amount],
    );
    return result.rows[0];
}

// Grava o resultado da chamada síncrona de criação (createCharge já
// retornou) -- não mexe em `status NOT IN (...)` porque neste ponto a
// linha só pode estar 'pending' (acabou de ser inserida acima).
export async function markPaymentChargeCreatedRow(
    client: PoolClient,
    value: {
        id: string;
        externalId: string | null;
        status: string;
        cardLastDigits?: string;
        cardBrand?: string;
        rawCreateResponse: Record<string, unknown>;
    },
): Promise<PaymentChargeRow | null> {
    const result = await client.query<PaymentChargeRow>(
        `UPDATE payment_charges
         SET external_id = $2, status = $3, card_last_digits = $4, card_brand = $5,
             raw_create_response = $6::jsonb, updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1
         RETURNING ${chargeFields}`,
        [
            value.id,
            value.externalId,
            value.status,
            value.cardLastDigits ?? null,
            value.cardBrand ?? null,
            JSON.stringify(value.rawCreateResponse),
        ],
    );
    return result.rows[0] ?? null;
}

// Histórico de tentativas de cobrança de um pedido (pode haver mais de uma
// -- ver comentário da tabela na migration 044). Usado só pela camada de
// apresentação (orderPaymentDetailsService.ts), nunca por lógica de estado.
export async function listPaymentChargeRowsByOrder(client: PoolClient, orderId: string): Promise<PaymentChargeRow[]> {
    const result = await client.query<PaymentChargeRow>(
        `SELECT ${chargeFields} FROM payment_charges
         WHERE tenant_id = app_tenant_id() AND order_id = $1
         ORDER BY created_at DESC`,
        [orderId],
    );
    return result.rows;
}

// Tentativas ainda "vivas" de um pedido -- usado por
// paymentChargeService.ts::createOrderCharge para resolver ou cancelar
// qualquer tentativa anterior antes de abrir uma nova (regra "uma cobrança
// viva por pedido"). 'authorized' entra aqui porque, apesar de já ter sido
// confirmada do lado do provider no momento da criação, só vira 'paid' de
// verdade quando o webhook assíncrono chega -- até lá é uma tentativa em
// aberto como qualquer outra.
export async function listLivePaymentChargeRowsByOrder(client: PoolClient, orderId: string): Promise<PaymentChargeRow[]> {
    const result = await client.query<PaymentChargeRow>(
        `SELECT ${chargeFields} FROM payment_charges
         WHERE tenant_id = app_tenant_id() AND order_id = $1
           AND status IN ('pending', 'processing', 'authorized')
         ORDER BY created_at ASC`,
        [orderId],
    );
    return result.rows;
}

// Cobranças "vivas" que sobraram de pedidos que JÁ têm payment_status =
// 'paid' -- só existem por causa de dados anteriores a
// applyPaymentChargeWebhookEvent cancelar as irmãs vivas no momento em que
// uma cobrança confirma 'paid' (ver paymentChargeService.ts). Varre o
// tenant inteiro (não um pedido específico) porque é usada por um script de
// reparo pontual, não por um fluxo de requisição -- ver
// scripts/testar-reparar-cobrancas-orfas.ts.
const chargeFieldsPrefixed = chargeFields
    .split(", ")
    .map((field) => `pc.${field}`)
    .join(", ");

export async function listOrphanLivePaymentChargeRows(client: PoolClient): Promise<PaymentChargeRow[]> {
    const result = await client.query<PaymentChargeRow>(
        `SELECT ${chargeFieldsPrefixed} FROM payment_charges pc
         JOIN orders o ON o.id = pc.order_id AND o.tenant_id = pc.tenant_id
         WHERE pc.tenant_id = app_tenant_id()
           AND pc.status IN ('pending', 'processing', 'authorized')
           AND o.payment_status = 'paid'
         ORDER BY pc.created_at ASC`,
    );
    return result.rows;
}

interface ApplyStatusUpdate {
    status: string;
    externalStatus?: string;
    rawLastWebhook: Record<string, unknown>;
}

// Caminho principal de atualização assíncrona (webhook/reconciliação):
// casa por external_id. 0 linhas pode significar "já está num estado
// terminal" (idempotência, ok) ou "o external_id ainda não foi gravado por
// markPaymentChargeCreatedRow" (a corrida que insertPendingPaymentChargeRow
// existe pra cobrir) -- quem chama tenta applyPaymentChargeStatusById como
// fallback neste segundo caso (ver stripeWebhookService.ts).
export async function applyPaymentChargeStatusByExternalId(
    client: PoolClient,
    provider: string,
    externalId: string,
    update: ApplyStatusUpdate,
): Promise<PaymentChargeRow | null> {
    const result = await client.query<PaymentChargeRow>(
        `UPDATE payment_charges
         SET status = $3::payment_charge_status, external_status = COALESCE($4, external_status),
             raw_last_webhook = $5::jsonb,
             paid_at = CASE WHEN $3::payment_charge_status = 'paid' THEN now() ELSE paid_at END,
             updated_at = now()
         WHERE tenant_id = app_tenant_id() AND provider = $1 AND external_id = $2
           AND status NOT IN ('paid', 'failed', 'cancelled')
         RETURNING ${chargeFields}`,
        [provider, externalId, update.status, update.externalStatus ?? null, JSON.stringify(update.rawLastWebhook)],
    );
    return result.rows[0] ?? null;
}

export async function applyPaymentChargeStatusById(
    client: PoolClient,
    id: string,
    update: ApplyStatusUpdate,
): Promise<PaymentChargeRow | null> {
    const result = await client.query<PaymentChargeRow>(
        `UPDATE payment_charges
         SET status = $2::payment_charge_status, external_status = COALESCE($3, external_status),
             raw_last_webhook = $4::jsonb,
             paid_at = CASE WHEN $2::payment_charge_status = 'paid' THEN now() ELSE paid_at END,
             updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1
           AND status NOT IN ('paid', 'failed', 'cancelled')
         RETURNING ${chargeFields}`,
        [id, update.status, update.externalStatus ?? null, JSON.stringify(update.rawLastWebhook)],
    );
    return result.rows[0] ?? null;
}

// Reagenda a próxima checagem independente do resultado da consulta (não
// há coluna de contagem de tentativas no schema -- intervalo fixo, não
// backoff exponencial), pra uma cobrança cronicamente travada não girar o
// poller pra sempre (ver paymentReconciliationService.ts).
const RECONCILIATION_INTERVAL_MINUTES = 5;

export async function scheduleNextPaymentChargeCheckRow(client: PoolClient, id: string): Promise<void> {
    await client.query(
        `UPDATE payment_charges
         SET last_checked_at = now(),
             next_check_at = now() + ($2 || ' minutes')::interval,
             updated_at = now()
         WHERE tenant_id = app_tenant_id() AND id = $1`,
        [id, RECONCILIATION_INTERVAL_MINUTES],
    );
}
