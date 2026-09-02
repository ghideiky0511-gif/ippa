import type { ExternalApiCallReporter } from "@/lib/externalApiCall";

// Contrato que todo provider de gateway de pagamento implementa. Ao
// contrário de erp/types.ts (um formato de domínio único por método),
// pagamento tem payload bem diferente por método (Pix = qr code, boleto =
// linha digitável, cartão = autorização síncrona) -- por isso ChargeResult é
// uma union discriminada por `method`, não um shape único. Este arquivo não
// conhece banco nem tenant: quem resolve qual provider usar para qual
// tenant é @/services/payments/paymentIntegrationService e
// paymentChargeService, não esta camada.

export type PaymentMethod = "pix" | "boleto" | "cartao";

export type PaymentProviderCredentials = Record<string, unknown>;

export interface CreateChargeInput {
    amount: number;
    method: PaymentMethod;
    orderId: string;
    // Número sequencial do pedido, mostrado ao cliente na loja (ex. "Pedido
    // #42") -- diferente de orderId (uuid interno), que não é legível.
    // Providers usam isso pra montar descrição/referência mais úteis do que
    // o uuid puro na tela de detalhes do pagamento (ex. Mercado Pago
    // mostrava só "Pedido <uuid>" sem contexto nenhum do pedido).
    orderNumber?: number;
    // Itens do pedido, pra providers que aceitam uma lista detalhada (ex.
    // Mercado Pago Orders API `items[]`) e mostram isso na tela de detalhes
    // do pagamento pro comprador. Opcional -- providers sem suporte
    // simplesmente ignoram.
    items?: Array<{ title: string; quantity: number; unitPrice: number }>;
    customer: { name: string; document: string; email: string };
    // Cartão: token gerado client-side pelo SDK do provider (ex. iugu.js) --
    // a ippa nunca vê o PAN, só recebe o token para autorizar a cobrança.
    cardToken?: string;
    installments?: number;
    // Cartão via Mercado Pago: o Card Payment Brick devolve payment_method_id
    // (bandeira, ex. "visa"/"master") e issuer_id junto do token -- a API de
    // pagamentos exige os dois além do token (diferente da Stripe, que
    // resolve a bandeira a partir do PaymentMethod já criado). Ausentes para
    // providers que não precisam disso.
    paymentMethodId?: string;
    issuerId?: string;
    // Id da linha payment_charges já commitada por paymentChargeService
    // ANTES desta chamada -- providers que precisam de uma chave estável
    // pro webhook encontrar a cobrança mesmo que ele chegue antes desta
    // chamada retornar (ex. metadata do PaymentIntent na Stripe) usam este
    // valor; providers sem essa corrida (mock) simplesmente ignoram.
    internalChargeId?: string;
}

export interface PixChargeResult {
    method: "pix";
    externalId: string;
    qrCode: string;
    copyPaste: string;
    expiresAt: Date;
    raw: Record<string, unknown>;
}

export interface BoletoChargeResult {
    method: "boleto";
    externalId: string;
    barcode: string;
    pdfUrl: string;
    expiresAt: Date;
    raw: Record<string, unknown>;
}

export interface CardChargeResult {
    method: "cartao";
    externalId: string;
    status: "authorized" | "failed";
    lastDigits?: string;
    brand?: string;
    failureReason?: string;
    raw: Record<string, unknown>;
}

export type ChargeResult = PixChargeResult | BoletoChargeResult | CardChargeResult;

export type PaymentChargeStatus =
    | "pending"
    | "processing"
    | "authorized"
    | "paid"
    | "failed"
    | "expired"
    | "cancelled";

// Evento normalizado, tanto de webhook (parseWebhook) quanto de consulta
// ativa (fetchChargeStatus) -- os dois alimentam o mesmo caminho de
// atualização em paymentChargeService, então compartilham o mesmo shape.
export interface WebhookEvent {
    externalId: string;
    externalEventId?: string;
    type: string;
    status: PaymentChargeStatus;
    raw: Record<string, unknown>;
}

export interface PaymentProvider {
    readonly code: string;
    createCharge(input: CreateChargeInput): Promise<ChargeResult>;
    // Reconciliação ativa (ver paymentChargeService.getChargeStatus) --
    // consulta direta ao provider, usada quando next_check_at vence antes de
    // qualquer webhook chegar.
    fetchChargeStatus(externalId: string): Promise<WebhookEvent>;
    // null = assinatura inválida ou evento irrelevante para este contrato
    // (ex. tipo de evento que este provider dispara mas não mapeamos) --
    // quem chama trata null como "ignorar, não é erro".
    parseWebhook(
        rawBody: string,
        headers: Record<string, string>,
        webhookSecret?: string,
    ): WebhookEvent | null;
    // Opcional: providers sem checagem barata própria simplesmente não
    // implementam -- ausência é "sem teste disponível", nunca falha (mesmo
    // raciocínio de ErpProvider.testConnection).
    testConnection?(): Promise<{ ok: boolean; message?: string }>;
    // Opcional: usado por paymentChargeService.ts para encerrar uma
    // tentativa anterior ainda em aberto antes de permitir uma nova (regra
    // "uma cobrança viva por pedido"). Ausência = provider não suporta
    // cancelamento explícito; quem chama trata isso como impedimento para a
    // nova tentativa, não como sucesso silencioso. Deve lançar se o provider
    // rejeitar o cancelamento (ex. cobrança já capturada do lado dele).
    cancelCharge?(externalId: string): Promise<void>;
}

// reporter é opcional e não carrega tenant/banco (ver lib/externalApiCall.ts)
// -- quem resolve o tenant (paymentIntegrationService/paymentChargeService)
// fecha o reporter sobre ele antes de chamar a fábrica.
export type PaymentProviderFactory = (
    credentials: PaymentProviderCredentials,
    reporter?: ExternalApiCallReporter,
) => PaymentProvider;
