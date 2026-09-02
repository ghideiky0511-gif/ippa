import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { ExternalApiCallReporter } from "@/lib/externalApiCall";
import type {
    CardChargeResult,
    ChargeResult,
    CreateChargeInput,
    PaymentChargeStatus,
    PaymentProvider,
    PaymentProviderCredentials,
    PixChargeResult,
    WebhookEvent,
} from "../../types";
import { MERCADOPAGO_API_BASE, getMercadoPagoApplicationFeeBps } from "./client";
import { getCommercialIntegrationBrand } from "@/lib/branding";

// Split Payments (marketplace via OAuth): diferente da Stripe, aqui
// `credentials` VEM de credentials_encrypted decifrado de verdade -- o
// access_token é segredo por tenant (não uma chave única de plataforma).
// Quem chama createMercadoPagoPaymentProvider (paymentChargeService.ts,
// paymentReconciliationService.ts, via services/payments/providerCredentials.ts)
// já resolveu/renovou o token antes de montar `credentials` -- este arquivo
// não conhece banco/tenant nem faz refresh (ver payments/types.ts, "este
// arquivo não conhece banco nem tenant").
//
// Migrado da API de Pagamentos (POST /v1/payments) pra API de Orders (POST
// /v1/orders) -- decisão explícita de manter o app Mercado Pago da
// plataforma na geração mais nova, mesmo com a API de Pagamentos ainda
// funcional (só recebe correção de segurança). externalId de payment_charges
// agora é o order_id (não mais um payment_id), e `raw_create_response`
// grava o objeto ORDER inteiro, não um payment plano -- ver
// extractMercadoPagoCardTransactionDetails/extractMercadoPagoFailureMessage
// abaixo, que leem de transactions.payments[0].
//
// parseWebhook existe pra satisfazer o contrato PaymentProvider, mas (mesmo
// caso da Stripe) o roteamento real não passa por aqui: o corpo do webhook
// da API de Orders só traz `{ type: "order", data: { id: orderId } }`, sem
// status -- quem resolve tenant + status de verdade é
// mercadoPagoWebhookService.ts (busca o tenant via payment_charges, depois
// consulta GET /v1/orders/{id}). Este parseWebhook só consegue mapear um
// evento se o corpo já vier com o objeto de order completo (ex. teste), não
// o payload magro real.

function toMercadoPagoCredentials(credentials: PaymentProviderCredentials): { accessToken: string } {
    const accessToken = String(credentials.accessToken ?? "").trim();
    if (!accessToken) {
        throw new Error("createMercadoPagoPaymentProvider requer credentials.accessToken.");
    }
    return { accessToken };
}

interface MercadoPagoApiError extends Error {
    statusCode?: number;
    body?: unknown;
}

async function report<T>(
    reporter: ExternalApiCallReporter | undefined,
    operation: string,
    method: string,
    endpoint: string,
    run: () => Promise<T>,
): Promise<T> {
    const startedAt = Date.now();
    try {
        const result = await run();
        await reporter?.({
            operation,
            method,
            endpoint,
            statusCode: 200,
            success: true,
            durationMs: Date.now() - startedAt,
        });
        return result;
    } catch (exc) {
        const apiError = exc as MercadoPagoApiError;
        await reporter?.({
            operation,
            method,
            endpoint,
            statusCode: apiError?.statusCode ?? null,
            success: false,
            durationMs: Date.now() - startedAt,
            errorMessage: apiError?.message,
        });
        throw exc;
    }
}

// marketplace_fee da API de Orders é uma string decimal (ex. "15.00"),
// diferente do application_fee numérico da API de Pagamentos -- [verificar
// contra a documentação atual]: a nesting exata (campo na raiz do order,
// como abaixo, vs. dentro de cada transactions.payments[]) não foi
// encontrada num exemplo de checkout online durante a pesquisa desta
// migração, só inferida de tabelas de comparação da árvore de POS/QR: se a
// API rejeitar com marketplace_fee_not_allowed ou ignorar o valor, mover
// pra dentro de cada payment em transactions.payments[].marketplace_fee.
function applicationFeeAmount(amount: number): string | undefined {
    const bps = getMercadoPagoApplicationFeeBps();
    const fee = Math.round((amount * bps) / 100) / 100;
    return fee > 0 ? fee.toFixed(2) : undefined;
}

async function mercadoPagoFetch<T>(
    accessToken: string,
    path: string,
    init: { method: string; body?: unknown; idempotencyKey?: string; deviceId?: string },
): Promise<T> {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
    };
    if (init.idempotencyKey) headers["X-Idempotency-Key"] = init.idempotencyKey;
    // Device fingerprint do Security.js (carregado automaticamente pelo SDK
    // JS do Mercado Pago junto com initMercadoPago, ver
    // window.MP_DEVICE_SESSION_ID no frontend) -- melhora a análise de risco
    // da transação (o que provavelmente teria evitado o high_risk visto em
    // teste manual sem device id). Documentado só pra API de Pagamentos
    // legada, mas a Orders API aceita o mesmo header.
    if (init.deviceId) headers["X-meli-session-id"] = init.deviceId;
    const response = await fetch(`${MERCADOPAGO_API_BASE}${path}`, {
        method: init.method,
        headers,
        body: init.body ? JSON.stringify(init.body) : undefined,
    });
    const text = await response.text();
    const parsed = text ? (JSON.parse(text) as unknown) : {};
    if (!response.ok) {
        // Um 402 de PROCESSAMENTO na API de Orders não é um erro de request
        // malformado -- é "a order foi aceita, mas a transação em si
        // falhou". Confirmado em produção que o corpo real desse caso é o
        // envelope `{ errors: [{ code, message, details: ["<paymentId>:
        // <status_detail>"] }], data: <objeto ORDER inteiro> }` -- nem o
        // `cause[]`/`message` de erro de request (esses cobrem 400/401),
        // nem o order puro sem wrapper (hipótese inicial, também vista em
        // alguns relatos). O status_detail de verdade fica tanto em
        // data.transactions.payments[0].status_detail quanto embutido em
        // errors[0].details (formato "<paymentId>: <status_detail>") --
        // manter os dois caminhos, além do body.cause antigo, já que a MP
        // não documenta um schema de erro único e estável.
        const body = parsed as {
            message?: string;
            error?: string;
            cause?: Array<{ code?: string | number; description?: string }>;
            errors?: Array<{ code?: string; message?: string; details?: string[] }>;
            status_detail?: string;
            transactions?: { payments?: Array<{ status_detail?: string }> };
            data?: {
                status_detail?: string;
                transactions?: { payments?: Array<{ status_detail?: string }> };
            };
        };
        const causeText = Array.isArray(body.cause)
            ? body.cause.map((c) => c?.description ?? (c?.code !== undefined ? String(c.code) : undefined)).filter(Boolean).join("; ")
            : undefined;
        const errorsText = Array.isArray(body.errors)
            ? body.errors
                  .map((e) => [e?.message, ...(Array.isArray(e?.details) ? e.details : [])].filter(Boolean).join(" | "))
                  .filter(Boolean)
                  .join("; ")
            : undefined;
        const statusDetail =
            body.transactions?.payments?.[0]?.status_detail ??
            body.data?.transactions?.payments?.[0]?.status_detail ??
            body.status_detail ??
            body.data?.status_detail;
        // Se nenhum dos campos conhecidos (message/cause/errors/status_detail)
        // veio preenchido, o corpo pode estar vazio ou num formato ainda não
        // mapeado -- nesse caso é melhor logar o corpo bruto do que um
        // "Payment Required" mudo, pra dar pra diagnosticar (ex. aplicação
        // sem meio de pagamento habilitado, moeda não suportada, token de
        // ambiente errado -- casos que a API rejeita sem preencher nenhum
        // desses campos "de transação").
        const knownDetail = body.message ?? causeText ?? errorsText ?? body.error ?? statusDetail;
        const detail = knownDetail ?? response.statusText;
        const rawBodyDump = !knownDetail && text ? ` [body: ${text.slice(0, 500)}]` : !knownDetail ? " [body vazio]" : "";
        const error = new Error(
            `Mercado Pago ${init.method} ${path} falhou (${response.status}): ${detail}${
                causeText && causeText !== detail ? ` [cause: ${causeText}]` : ""
            }${errorsText && errorsText !== detail ? ` [errors: ${errorsText}]` : ""}${
                statusDetail && statusDetail !== detail ? ` [status_detail: ${statusDetail}]` : ""
            }${rawBodyDump}`,
        ) as MercadoPagoApiError;
        error.statusCode = response.status;
        error.body = parsed;
        throw error;
    }
    return parsed as T;
}

// status/status_detail de transactions.payments[] na API de Orders --
// confirmado contra a documentação (checkout-api-orders/payment-management/
// status/transaction-status) nesta migração. "action_required" é um guarda-
// chuva de vários estados intermediários: status_detail "waiting_capture" é
// autorização síncrona aguardando captura manual (não usado aqui,
// processing_mode é sempre "automatic"), os demais (waiting_payment --
// Pix ainda não pago, waiting_transfer, waiting_retry, pending_challenge)
// ainda não confirmaram nada, tratados como "pending". charged_back/
// refunded mapeiam pra "failed" só por completude de tipo: na prática nunca
// chegam a aplicar nada, porque nesse ponto a cobrança já está em status
// terminal 'paid' e o guard `status NOT IN ('paid','failed','cancelled')`
// em paymentChargesModel.ts bloqueia a regressão (mesma garantia que
// protege a Stripe de um evento de estorno tardio).
function mapMercadoPagoTransactionStatus(status: string, statusDetail?: string): PaymentChargeStatus {
    switch (status) {
        case "created":
            return "pending";
        case "processed":
            return "paid";
        case "processing":
        case "in_review":
            return "processing";
        case "action_required":
            return statusDetail === "waiting_capture" ? "authorized" : "pending";
        case "canceled":
            return "cancelled";
        case "expired":
            return "expired";
        case "charged_back":
        case "refunded":
        case "failed":
            return "failed";
        default:
            return "pending";
    }
}

interface MercadoPagoOrderTransactionPaymentMethod {
    id?: string;
    type?: string;
    token?: string;
    installments?: number;
    issuer_id?: string;
    authorization_code?: string;
    ticket_url?: string;
    qr_code?: string;
    qr_code_base64?: string;
    [key: string]: unknown;
}

interface MercadoPagoOrderTransactionPayment {
    id?: string;
    status: string;
    status_detail?: string;
    amount?: string;
    payment_method?: MercadoPagoOrderTransactionPaymentMethod;
    expiration_time?: string;
    [key: string]: unknown;
}

interface MercadoPagoOrderResponse {
    id: string;
    status: string;
    status_detail?: string;
    external_reference?: string;
    transactions?: {
        payments?: MercadoPagoOrderTransactionPayment[];
        refunds?: unknown[];
    };
    [key: string]: unknown;
}

function firstPayment(order: MercadoPagoOrderResponse): MercadoPagoOrderTransactionPayment | undefined {
    return order.transactions?.payments?.[0];
}

function toCardChargeResult(order: MercadoPagoOrderResponse): CardChargeResult {
    const payment = firstPayment(order);
    const mapped = payment
        ? mapMercadoPagoTransactionStatus(payment.status, payment.status_detail)
        : mapMercadoPagoTransactionStatus(order.status, order.status_detail);
    // "authorized" aqui é o mesmo sentido amplo usado pra Stripe
    // (toCardChargeResult em providers/stripe/index.ts): "não falhou de
    // forma síncrona", não necessariamente já liquidado -- 'paid'/'pending'/
    // 'processing'/'authorized' de verdade só se resolvem depois via
    // fetchChargeStatus/webhook (ver mapChargeStatusToOrderPaymentUpdate em
    // paymentChargeService.ts).
    const succeeded = mapped === "paid" || mapped === "authorized" || mapped === "processing" || mapped === "pending";
    return {
        method: "cartao",
        externalId: String(order.id),
        status: succeeded ? "authorized" : "failed",
        failureReason: succeeded ? undefined : extractMercadoPagoFailureMessage(order as unknown as Record<string, unknown>),
        raw: order as unknown as Record<string, unknown>,
    };
}

function toPixChargeResult(order: MercadoPagoOrderResponse): PixChargeResult {
    // qr_code (copia-e-cola)/qr_code_base64 (imagem) vivem dentro de
    // transactions.payments[0].payment_method na API de Orders --
    // confirmado contra a documentação (checkout-api-orders) nesta migração,
    // mesmo lugar tanto na resposta de criação quanto no GET de consulta.
    const paymentMethod = firstPayment(order)?.payment_method;
    const payment = firstPayment(order);
    return {
        method: "pix",
        externalId: String(order.id),
        qrCode: paymentMethod?.qr_code_base64 ? `data:image/png;base64,${paymentMethod.qr_code_base64}` : "",
        copyPaste: paymentMethod?.qr_code ?? "",
        expiresAt: payment?.expiration_time ? parsePixExpiration(payment.expiration_time) : new Date(Date.now() + 30 * 60_000),
        raw: order as unknown as Record<string, unknown>,
    };
}

// expiration_time da API de Orders é uma duração ISO-8601 (ex.
// "P3Y6M4DT12H30M5S"), diferente de date_of_expiration (timestamp absoluto)
// da API de Pagamentos -- só o componente de tempo (dias/horas/minutos/
// segundos) importa pra um Pix (nunca anos/meses reais). [verificar contra
// a documentação atual]: não exercitado contra uma resposta real ainda.
function parsePixExpiration(duration: string): Date {
    const match = /^P(?:\d+Y)?(?:\d+M)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(duration);
    if (!match) return new Date(Date.now() + 30 * 60_000);
    const [, days, hours, minutes, seconds] = match;
    const totalMs =
        (Number(days ?? 0) * 86_400 + Number(hours ?? 0) * 3_600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0)) * 1000;
    return new Date(Date.now() + (totalMs || 30 * 60_000));
}

// Reaproveitado por paymentChargeService.ts (CARD_DETAIL_EXTRACTORS) --
// mesmo papel de extractStripeCardTransactionDetails. `raw` aqui é o objeto
// ORDER inteiro (raw_create_response), não mais um payment plano --
// authorization_code é o campo mais próximo de um NSU que a API de Orders
// expõe [verificar contra a documentação atual, não confirmado no payment_method
// de um exemplo real].
export function extractMercadoPagoCardTransactionDetails(
    raw: Record<string, unknown>,
): { nsu?: string; installments: number } {
    const order = raw as Partial<MercadoPagoOrderResponse>;
    const payment = order.transactions?.payments?.[0];
    const paymentMethod = payment?.payment_method;
    return {
        nsu: typeof paymentMethod?.authorization_code === "string" ? paymentMethod.authorization_code : undefined,
        installments: typeof paymentMethod?.installments === "number" ? paymentMethod.installments : 1,
    };
}

// Reaproveitado por paymentChargeService.ts (FAILURE_MESSAGE_EXTRACTORS) --
// mesmo papel de extractStripeFailureMessage. `raw.error` cobre o caminho
// de erro inesperado (ver catch em createOrderCharge, que grava
// { error: message } em vez do order inteiro). status_detail do primeiro
// payment cobre a recusa de cartão (ex. "rejected_by_issuer",
// "insufficient_amount" -- ver mapMercadoPagoTransactionStatus); cai pro
// status_detail do order só se não houver nenhum payment ainda.
export function extractMercadoPagoFailureMessage(raw: Record<string, unknown>): string | undefined {
    const wrapped = (raw as { error?: unknown }).error;
    if (typeof wrapped === "string") return wrapped;
    const order = raw as Partial<MercadoPagoOrderResponse>;
    const paymentDetail = order.transactions?.payments?.[0]?.status_detail;
    if (typeof paymentDetail === "string") return paymentDetail;
    return typeof order.status_detail === "string" ? order.status_detail : undefined;
}

// Verifica o header x-signature -- mesma ordem de operações da Stripe
// (assinatura verificada ANTES de qualquer campo do payload ser confiado).
// Confirmado contra a documentação nesta migração: mesmo formato na API de
// Orders (`ts=<epoch ms>,v1=<hex hmac-sha256>` e manifest
// `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`), só que `data.id` agora
// é o order_id, não mais um payment_id.
export function verifyMercadoPagoWebhookSignature(
    dataId: string,
    headers: Record<string, string>,
    webhookSecret: string,
): boolean {
    const signatureHeader = headers["x-signature"] ?? headers["X-Signature"];
    const requestId = headers["x-request-id"] ?? headers["X-Request-Id"];
    if (!signatureHeader || !requestId) return false;
    const parts = Object.fromEntries(
        signatureHeader.split(",").map((part) => {
            const [key, value] = part.split("=").map((piece) => piece.trim());
            return [key, value];
        }),
    );
    const ts = parts.ts;
    const expectedHash = parts.v1;
    if (!ts || !expectedHash) return false;
    const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
    const computedHash = createHmac("sha256", webhookSecret).update(manifest).digest("hex");
    const expected = Buffer.from(expectedHash, "hex");
    const computed = Buffer.from(computedHash, "hex");
    if (expected.length !== computed.length) return false;
    return timingSafeEqual(expected, computed);
}

export function createMercadoPagoPaymentProvider(
    credentials: PaymentProviderCredentials,
    reporter?: ExternalApiCallReporter,
): PaymentProvider {
    const { accessToken } = toMercadoPagoCredentials(credentials);

    return {
        code: "mercadopago",

        async createCharge(input: CreateChargeInput): Promise<ChargeResult> {
            if (input.method === "boleto") {
                // Fora de escopo (só Pix + Cartão) -- guard honesto, mesmo
                // padrão do "método ainda não suportado" da Stripe.
                throw new Error('Mercado Pago: método "boleto" ainda não suportado.');
            }
            const payer = {
                email: input.customer.email,
                first_name: input.customer.name.split(" ")[0] || input.customer.name,
                last_name: input.customer.name.split(" ").slice(1).join(" ") || input.customer.name,
                identification: {
                    type: input.customer.document.replace(/\D/g, "").length > 11 ? "CNPJ" : "CPF",
                    number: input.customer.document.replace(/\D/g, ""),
                },
            };
            const totalAmount = input.amount.toFixed(2);
            const marketplaceFee = applicationFeeAmount(input.amount);
            // orderNumber (sequencial, mostrado na loja) é bem mais legível
            // do que orderId (uuid interno) na tela de detalhes do
            // pagamento do comprador -- cai pro uuid só se o chamador não
            // tiver o número à mão. Marca vem de getCommercialIntegrationBrand
            // (APP_COMERCIAL_NAME_INTEGRATION), mesmo padrão de identificador
            // já usado pro pedido no ERP (ver buildProviderOrderIdempotencyKey
            // em orderPushService.ts) -- mantém o pedido reconhecível pelo
            // mesmo código em qualquer integração externa, não só uma marca
            // genérica "Pedido". `items[]` é opcional na API de Orders, mas
            // quando presente aparece detalhado na mesma tela (produto, qtd,
            // valor unitário), em vez de só o total.
            const brand = getCommercialIntegrationBrand();
            const description = input.orderNumber
                ? `${brand}${input.orderNumber}`
                : `${brand}${input.orderId}`;
            // Confirmado na tela "Detalhe da transação" do comprador: quando
            // `items[]` é enviado, a MP substitui `description` por um
            // resumo automático ("5 produtos") ali -- o único campo dessa
            // tela que ainda ecoa o que mandamos é "Referência adicional",
            // que é external_reference. Por isso usamos o mesmo texto
            // com marca+número aqui (não internalChargeId/orderId cru): sem
            // isso o pedido não fica identificável em lugar nenhum da tela
            // pro comprador nem pro lojista no painel MP. external_reference
            // não é lido de volta em nenhum lugar do código (reconciliação
            // de webhook usa metadata.charge_id, ver extractInternalChargeId
            // em paymentChargeService.ts), então reformatar aqui é seguro.
            const externalReference = description;
            const items = input.items?.length
                ? input.items.map((item) => ({
                      title: item.title,
                      quantity: item.quantity,
                      unit_price: item.unitPrice.toFixed(2),
                  }))
                : undefined;

            if (input.method === "pix") {
                const order = await report(reporter, "mercadopago.orders.create.pix", "POST", "/v1/orders", () =>
                    mercadoPagoFetch<MercadoPagoOrderResponse>(accessToken, "/v1/orders", {
                        method: "POST",
                        idempotencyKey: input.internalChargeId,
                        deviceId: input.deviceId,
                        body: {
                            type: "online",
                            processing_mode: "automatic",
                            total_amount: totalAmount,
                            external_reference: externalReference,
                            description,
                            items,
                            marketplace_fee: marketplaceFee,
                            payer,
                            transactions: {
                                payments: [
                                    {
                                        amount: totalAmount,
                                        payment_method: { id: "pix", type: "bank_transfer" },
                                    },
                                ],
                            },
                        },
                    }),
                );
                return toPixChargeResult(order);
            }

            if (!input.cardToken || !input.paymentMethodId) {
                return {
                    method: "cartao",
                    externalId: "",
                    status: "failed",
                    failureReason: "Token de cartão ausente.",
                    raw: {},
                };
            }
            const order = await report(reporter, "mercadopago.orders.create.cartao", "POST", "/v1/orders", () =>
                mercadoPagoFetch<MercadoPagoOrderResponse>(accessToken, "/v1/orders", {
                    method: "POST",
                    idempotencyKey: input.internalChargeId,
                    deviceId: input.deviceId,
                    body: {
                        type: "online",
                        processing_mode: "automatic",
                        total_amount: totalAmount,
                        external_reference: externalReference,
                        description,
                        items,
                        marketplace_fee: marketplaceFee,
                        payer,
                        transactions: {
                            payments: [
                                {
                                    amount: totalAmount,
                                    // issuer_id NÃO é aceito aqui -- confirmado em produção: 400
                                    // "Properties not supported ... additionalProperties 'issuer_id'
                                    // not allowed" em transactions.payments[0].payment_method. Diferente
                                    // da API de Payments antiga (v1/payments), a API de Orders resolve
                                    // o emissor sozinha a partir do token; o Card Payment Brick devolve
                                    // issuer_id mesmo assim (ver CreateChargeInput.issuerId), então só
                                    // ignoramos aqui em vez de tirar do contrato genérico.
                                    payment_method: {
                                        id: input.paymentMethodId,
                                        type: "credit_card",
                                        token: input.cardToken,
                                        installments: input.installments ?? 1,
                                    },
                                },
                            ],
                        },
                    },
                }),
            );
            return toCardChargeResult(order);
        },

        async fetchChargeStatus(externalId: string): Promise<WebhookEvent> {
            const order = await report(reporter, "mercadopago.orders.get", "GET", "/v1/orders", () =>
                mercadoPagoFetch<MercadoPagoOrderResponse>(accessToken, `/v1/orders/${externalId}`, { method: "GET" }),
            );
            const payment = firstPayment(order);
            const status = payment
                ? mapMercadoPagoTransactionStatus(payment.status, payment.status_detail)
                : mapMercadoPagoTransactionStatus(order.status, order.status_detail);
            return {
                externalId: String(order.id),
                type: `order.${payment?.status ?? order.status}`,
                status,
                raw: order as unknown as Record<string, unknown>,
            };
        },

        async cancelCharge(externalId: string): Promise<void> {
            // A API de Orders só aceita cancelar enquanto status="created"
            // (Pix em action_required/waiting_transfer também é cancelável,
            // por ser o estado "ainda não chegou dinheiro" dele) -- mais
            // restritivo que a API de Pagamentos (aceitava pending/
            // in_process). Um order já processado rejeita com 409 -- quem
            // chama (paymentChargeService.ts::resolveOrCancelLiveCharge)
            // trata o lançamento como "não dá pra abrir uma nova tentativa
            // agora", mesmo comportamento de antes.
            // A API de Orders exige X-Idempotency-Key também no /cancel
            // (confirmado em produção: 400 "Missing HTTP header:
            // X-Idempotency-Key" sem ele) -- diferente da criação, aqui não
            // há um id interno estável disponível (a assinatura não recebe
            // chargeId), e cada chamada já representa uma tentativa de
            // cancelamento nova e não repetida automaticamente por quem
            // chama, então gerar uma chave nova por chamada é seguro.
            await report(reporter, "mercadopago.orders.cancel", "POST", "/v1/orders", () =>
                mercadoPagoFetch(accessToken, `/v1/orders/${externalId}/cancel`, {
                    method: "POST",
                    idempotencyKey: randomUUID(),
                }),
            );
        },

        parseWebhook(rawBody: string, headers: Record<string, string>, webhookSecret?: string): WebhookEvent | null {
            if (!webhookSecret) return null;
            let parsed: { type?: string; data?: { id?: string }; status?: string; id?: string | number };
            try {
                parsed = JSON.parse(rawBody);
            } catch {
                return null;
            }
            const dataId = parsed.data?.id ?? (parsed.id !== undefined ? String(parsed.id) : undefined);
            if (!dataId) return null;
            if (!verifyMercadoPagoWebhookSignature(dataId, headers, webhookSecret)) return null;
            // Corpo magro real (`{ type: "order", data: { id: orderId } }`,
            // sem status): não dá pra montar um WebhookEvent completo sem
            // uma chamada de rede extra -- ver mercadoPagoWebhookService.ts,
            // que é quem realmente processa este caso (faz o GET
            // /v1/orders/{id} depois de validar a assinatura). Só resolve
            // aqui se o corpo já trouxer o objeto de order completo (ex.
            // teste).
            if (typeof parsed.status !== "string") return null;
            return {
                externalId: dataId,
                type: `order.${parsed.status}`,
                status: mapMercadoPagoTransactionStatus(parsed.status),
                raw: parsed as unknown as Record<string, unknown>,
            };
        },

        async testConnection() {
            try {
                const account = await report(reporter, "mercadopago.users.me", "GET", "/users/me", () =>
                    mercadoPagoFetch<{ id: number | string }>(accessToken, "/users/me", { method: "GET" }),
                );
                if (!account?.id) return { ok: false, message: "Não foi possível confirmar a conta Mercado Pago." };
                return { ok: true };
            } catch (exc) {
                return {
                    ok: false,
                    message: exc instanceof Error ? exc.message : "Falha ao consultar a conta Mercado Pago.",
                };
            }
        },
    };
}

interface MercadoPagoUserResponse {
    id: number | string;
    nickname?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    identification?: { type?: string; number?: string };
    site_status?: string;
    [key: string]: unknown;
}

export interface MercadoPagoAccountSummary {
    id: string;
    nickname?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    documentType?: string;
    documentNumber?: string;
    siteStatus?: string;
}

// Chamado por mercadoPagoOnboardingService.ts::fetchMercadoPagoAccountSummary
// pra provar visualmente, na tela de integração, que o access_token salvo
// corresponde de fato à conta esperada (nome/apelido/documento) -- não usado
// no fluxo de cobrança. Mesmo endpoint que testConnection() já chama, mas
// devolvendo o corpo inteiro em vez de só validar `id`; documentNumber sai
// completo daqui de propósito, o redigido fica a cargo de quem exibe (ver
// maskDocumentNumber em mercadoPagoOnboardingService.ts) -- este arquivo não
// decide o que é seguro mostrar na tela, só traduz a resposta da API.
export async function fetchMercadoPagoAccountSummary(
    accessToken: string,
    reporter?: ExternalApiCallReporter,
): Promise<MercadoPagoAccountSummary> {
    const account = await report(reporter, "mercadopago.users.me", "GET", "/users/me", () =>
        mercadoPagoFetch<MercadoPagoUserResponse>(accessToken, "/users/me", { method: "GET" }),
    );
    return {
        id: String(account.id),
        nickname: account.nickname,
        firstName: account.first_name,
        lastName: account.last_name,
        email: account.email,
        documentType: account.identification?.type,
        documentNumber: account.identification?.number,
        siteStatus: account.site_status,
    };
}
