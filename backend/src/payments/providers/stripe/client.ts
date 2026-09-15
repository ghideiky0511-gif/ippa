import Stripe from "stripe";

// Bootstrap lazy do SDK, mesmo padrão de getPool()/getControlPool(): nunca
// lança na ausência de env var (deixa quem chama decidir o que fazer com
// null), constrói uma vez só. httpClient explícito via fetch (em vez do
// cliente https default do SDK) para os testes poderem mockar globalThis.fetch
// no mesmo estilo já usado em erp/providers/totvsmoda/client.test.ts, sem
// precisar de um seam de injeção de dependência à parte.
//
// A chave secreta é única, da PLATAFORMA (não por tenant) -- quem varia por
// tenant é o stripeAccount passado como request option em cada chamada (ver
// providers/stripe/index.ts). O webhook de eventos Connect usa DOIS secrets
// de assinatura, cada um do seu próprio Event Destination na Stripe: o
// endpoint clássico (snapshot events, ex. payment_intent.*) e o destino v2
// (thin events, ex. v2.core.account.*) exigem `whsec_` distintos -- não há
// como configurar um único destino cobrindo os dois formatos no Dashboard.

let client: Stripe | null | undefined;

export function getStripeClient(): Stripe | null {
    if (client === undefined) {
        const secretKey = String(process.env.STRIPE_SECRET_KEY ?? "").trim();
        client = secretKey
            ? new Stripe(secretKey, {
                  httpClient: Stripe.createFetchHttpClient(),
              })
            : null;
    }
    return client;
}

// Chave pública da plataforma (também única, não por tenant -- mesmo
// raciocínio de STRIPE_SECRET_KEY acima) -- exposta ao navegador via a
// resposta da API de resumo de pagamento (orderPaymentLinkService.ts), não
// via env de build do frontend: o frontend é uma imagem Docker só, servindo
// vários tenants, sem processo de build por tenant.
export function getStripePublishableKey(): string | undefined {
    const key = String(process.env.STRIPE_PUBLISHABLE_KEY ?? "").trim();
    return key || undefined;
}

// Secret do webhook endpoint clássico (snapshot events v1, ex.
// payment_intent.succeeded/payment_failed).
export function getConnectWebhookSecretV1(): string | undefined {
    const secret = String(process.env.STRIPE_CONNECT_WEBHOOK_SECRET ?? "").trim();
    return secret || undefined;
}

// Secret do Event Destination v2 (thin events, ex. v2.core.account.*).
export function getConnectWebhookSecretV2(): string | undefined {
    const secret = String(process.env.STRIPE_CONNECT_WEBHOOK_SECRET_V2 ?? "").trim();
    return secret || undefined;
}

export function getApplicationFeeBps(): number {
    const raw = Number(process.env.STRIPE_APPLICATION_FEE_BPS ?? "0");
    return Number.isFinite(raw) && raw >= 0 ? raw : 0;
}
