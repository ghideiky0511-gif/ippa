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
// providers/stripe/index.ts). O webhook de eventos Connect usa um secret de
// assinatura próprio, também único da plataforma (getConnectWebhookSecret).

let client: Stripe | null | undefined;

export function getStripeClient(): Stripe | null {
    if (client === undefined) {
        const secretKey = String(process.env.STRIPE_SECRET_KEY ?? "").trim();
        client = secretKey
            ? new Stripe(secretKey, {
                  apiVersion: "2025-02-24.acacia",
                  httpClient: Stripe.createFetchHttpClient(),
              })
            : null;
    }
    return client;
}

export function getConnectWebhookSecret(): string | undefined {
    const secret = String(process.env.STRIPE_CONNECT_WEBHOOK_SECRET ?? "").trim();
    return secret || undefined;
}

export function getApplicationFeeBps(): number {
    const raw = Number(process.env.STRIPE_APPLICATION_FEE_BPS ?? "0");
    return Number.isFinite(raw) && raw >= 0 ? raw : 0;
}
