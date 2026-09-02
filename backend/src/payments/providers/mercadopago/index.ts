import { createHmac, timingSafeEqual } from "node:crypto";
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

// Split Payments (marketplace via OAuth): diferente da Stripe, aqui
// `credentials` VEM de credentials_encrypted decifrado de verdade -- o
// access_token é segredo por tenant (não uma chave única de plataforma).
// Quem chama createMercadoPagoPaymentProvider (paymentChargeService.ts,
// paymentReconciliationService.ts, via services/payments/providerCredentials.ts)
// já resolveu/renovou o token antes de montar `credentials` -- este arquivo
// não conhece banco/tenant nem faz refresh (ver payments/types.ts, "este
// arquivo não conhece banco nem tenant").
//
// parseWebhook existe pra satisfazer o contrato PaymentProvider, mas (mesmo
// caso da Stripe) o roteamento real não passa por aqui: o corpo do webhook
// do Mercado Pago só traz `{ type, data: { id } }`, sem status -- quem
// resolve tenant + status de verdade é mercadoPagoWebhookService.ts (busca
// o tenant via payment_charges, depois consulta GET /v1/payments/{id}).
// Este parseWebhook só consegue mapear um evento se o corpo já vier com o
// objeto de pagamento completo (ex. teste), não o payload magro real.

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

// application_fee do Mercado Pago é um valor absoluto na moeda corrente
// (reais, com centavos), não em centavos inteiros como o
// application_fee_amount da Stripe -- por isso o arredondamento é a 2 casas
// decimais (centavos), não a inteiro. amount * bps / 10_000 = fee em reais;
// multiplicar por 100 antes de arredondar e dividir depois arredonda pro
// centavo mais próximo.
function applicationFeeAmount(amount: number): number {
    const bps = getMercadoPagoApplicationFeeBps();
    return Math.round((amount * bps) / 100) / 100;
}

async function mercadoPagoFetch<T>(
    accessToken: string,
    path: string,
    init: { method: string; body?: unknown; idempotencyKey?: string },
): Promise<T> {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
    };
    if (init.idempotencyKey) headers["X-Idempotency-Key"] = init.idempotencyKey;
    const response = await fetch(`${MERCADOPAGO_API_BASE}${path}`, {
        method: init.method,
        headers,
        body: init.body ? JSON.stringify(init.body) : undefined,
    });
    const text = await response.text();
    const parsed = text ? (JSON.parse(text) as unknown) : {};
    if (!response.ok) {
        const error = new Error(
            `Mercado Pago ${init.method} ${path} falhou (${response.status}): ${
                (parsed as { message?: string })?.message ?? response.statusText
            }`,
        ) as MercadoPagoApiError;
        error.statusCode = response.status;
        error.body = parsed;
        throw error;
    }
    return parsed as T;
}

// status/status_detail devolvidos pela API de Pagamentos -- [verificar
// contra a documentação atual] o conjunto abaixo é o assumido no plano.
// refunded/charged_back mapeiam pra "failed" só por completude de tipo: na
// prática nunca chegam a aplicar nada, porque nesse ponto a cobrança já
// está em status terminal 'paid' e o guard `status NOT IN ('paid','failed',
// 'cancelled')` em paymentChargesModel.ts bloqueia a regressão (mesma
// garantia que protege a Stripe de um evento de estorno tardio).
function mapMercadoPagoStatus(status: string): PaymentChargeStatus {
    switch (status) {
        case "approved":
            return "paid";
        case "authorized":
            return "authorized";
        case "in_process":
        case "in_mediation":
            return "processing";
        case "pending":
            return "pending";
        case "cancelled":
            return "cancelled";
        case "rejected":
        case "refunded":
        case "charged_back":
            return "failed";
        default:
            return "pending";
    }
}

interface MercadoPagoPaymentResponse {
    id: number | string;
    status: string;
    status_detail?: string;
    authorization_code?: string;
    installments?: number;
    date_of_expiration?: string;
    point_of_interaction?: {
        transaction_data?: {
            qr_code?: string;
            qr_code_base64?: string;
        };
    };
    [key: string]: unknown;
}

function toCardChargeResult(payment: MercadoPagoPaymentResponse): CardChargeResult {
    const mapped = mapMercadoPagoStatus(payment.status);
    // "authorized" aqui é o mesmo sentido amplo usado pra Stripe
    // (toCardChargeResult em providers/stripe/index.ts): "não falhou de
    // forma síncrona", não necessariamente já liquidado -- 'paid'/'pending'/
    // 'processing'/'authorized' de verdade só se resolvem depois via
    // fetchChargeStatus/webhook (ver mapChargeStatusToOrderPaymentUpdate em
    // paymentChargeService.ts).
    const succeeded = mapped === "paid" || mapped === "authorized" || mapped === "processing" || mapped === "pending";
    return {
        method: "cartao",
        externalId: String(payment.id),
        status: succeeded ? "authorized" : "failed",
        failureReason: succeeded ? undefined : extractMercadoPagoFailureMessage(payment as Record<string, unknown>),
        raw: payment as unknown as Record<string, unknown>,
    };
}

function toPixChargeResult(payment: MercadoPagoPaymentResponse): PixChargeResult {
    const transactionData = payment.point_of_interaction?.transaction_data;
    // [verificar contra a documentação atual]: qr_code é o "Pix Copia e
    // Cola" (string), qr_code_base64 é a imagem do QR já em base64 -- não
    // testado contra uma resposta real nesta sessão.
    return {
        method: "pix",
        externalId: String(payment.id),
        qrCode: transactionData?.qr_code_base64 ? `data:image/png;base64,${transactionData.qr_code_base64}` : "",
        copyPaste: transactionData?.qr_code ?? "",
        expiresAt: payment.date_of_expiration ? new Date(payment.date_of_expiration) : new Date(Date.now() + 30 * 60_000),
        raw: payment as unknown as Record<string, unknown>,
    };
}

// Reaproveitado por paymentChargeService.ts (CARD_DETAIL_EXTRACTORS) --
// mesmo papel de extractStripeCardTransactionDetails. authorization_code é
// o campo mais próximo de um NSU que a API de Pagamentos expõe
// [verificar contra a documentação atual].
export function extractMercadoPagoCardTransactionDetails(
    raw: Record<string, unknown>,
): { nsu?: string; installments: number } {
    const payment = raw as Partial<MercadoPagoPaymentResponse>;
    return {
        nsu: typeof payment.authorization_code === "string" ? payment.authorization_code : undefined,
        installments: typeof payment.installments === "number" ? payment.installments : 1,
    };
}

// Reaproveitado por paymentChargeService.ts (FAILURE_MESSAGE_EXTRACTORS) --
// mesmo papel de extractStripeFailureMessage. `raw.error` cobre o caminho
// de erro inesperado (ver catch em createOrderCharge, que grava
// { error: message } em vez do payment inteiro).
export function extractMercadoPagoFailureMessage(raw: Record<string, unknown>): string | undefined {
    const wrapped = (raw as { error?: unknown }).error;
    if (typeof wrapped === "string") return wrapped;
    const payment = raw as Partial<MercadoPagoPaymentResponse>;
    return typeof payment.status_detail === "string" ? payment.status_detail : undefined;
}

// Verifica o header x-signature -- mesma ordem de operações da Stripe
// (assinatura verificada ANTES de qualquer campo do payload ser confiado).
// [verificar contra a documentação atual]: formato exato do manifest e dos
// headers x-signature/x-request-id -- confirmado por busca nesta sessão
// como `ts=<epoch ms>,v1=<hex hmac-sha256>` e manifest
// `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`, mas não exercitado
// contra uma notificação real.
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
            const applicationFee = applicationFeeAmount(input.amount);

            if (input.method === "pix") {
                const payment = await report(reporter, "mercadopago.payments.create.pix", "POST", "/v1/payments", () =>
                    mercadoPagoFetch<MercadoPagoPaymentResponse>(accessToken, "/v1/payments", {
                        method: "POST",
                        idempotencyKey: input.internalChargeId,
                        body: {
                            transaction_amount: input.amount,
                            payment_method_id: "pix",
                            payer,
                            external_reference: input.internalChargeId ?? input.orderId,
                            application_fee: applicationFee || undefined,
                            description: `Pedido ${input.orderId}`,
                        },
                    }),
                );
                return toPixChargeResult(payment);
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
            const payment = await report(reporter, "mercadopago.payments.create.cartao", "POST", "/v1/payments", () =>
                mercadoPagoFetch<MercadoPagoPaymentResponse>(accessToken, "/v1/payments", {
                    method: "POST",
                    idempotencyKey: input.internalChargeId,
                    body: {
                        transaction_amount: input.amount,
                        token: input.cardToken,
                        payment_method_id: input.paymentMethodId,
                        issuer_id: input.issuerId,
                        installments: input.installments ?? 1,
                        payer,
                        external_reference: input.internalChargeId ?? input.orderId,
                        application_fee: applicationFee || undefined,
                        description: `Pedido ${input.orderId}`,
                    },
                }),
            );
            return toCardChargeResult(payment);
        },

        async fetchChargeStatus(externalId: string): Promise<WebhookEvent> {
            const payment = await report(reporter, "mercadopago.payments.get", "GET", "/v1/payments", () =>
                mercadoPagoFetch<MercadoPagoPaymentResponse>(accessToken, `/v1/payments/${externalId}`, { method: "GET" }),
            );
            return {
                externalId: String(payment.id),
                type: `payment.${payment.status}`,
                status: mapMercadoPagoStatus(payment.status),
                raw: payment as unknown as Record<string, unknown>,
            };
        },

        async cancelCharge(externalId: string): Promise<void> {
            // Mercado Pago só aceita cancelar pagamentos ainda pending/
            // in_process -- um já approved rejeita, mesmo raciocínio do
            // cancelCharge da Stripe (o dinheiro já está em trânsito ou
            // capturado, "cancelar" seria mentira). Quem chama
            // (paymentChargeService.ts::resolveOrCancelLiveCharge) trata o
            // lançamento como "não dá pra abrir uma nova tentativa agora".
            await report(reporter, "mercadopago.payments.cancel", "PUT", "/v1/payments", () =>
                mercadoPagoFetch(accessToken, `/v1/payments/${externalId}`, {
                    method: "PUT",
                    body: { status: "cancelled" },
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
            // Corpo magro real (`{ type, data: { id } }`, sem status): não
            // dá pra montar um WebhookEvent completo sem uma chamada de rede
            // extra -- ver mercadoPagoWebhookService.ts, que é quem
            // realmente processa este caso (faz o GET /v1/payments/{id}
            // depois de validar a assinatura). Só resolve aqui se o corpo já
            // trouxer o objeto de pagamento completo (ex. teste).
            if (typeof parsed.status !== "string") return null;
            return {
                externalId: dataId,
                type: `payment.${parsed.status}`,
                status: mapMercadoPagoStatus(parsed.status),
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
