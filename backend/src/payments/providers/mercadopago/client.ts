// Bootstrap de configuração, mesmo padrão de providers/stripe/client.ts:
// getters lazy sobre env vars, nunca lançam na ausência de configuração
// (quem chama decide o que fazer com undefined). Diferente da Stripe, não
// há SDK oficial instanciado aqui -- os providers/mercadopago/{index,oauth}.ts
// usam fetch puro contra a API REST, pelo mesmo motivo de
// Stripe.createFetchHttpClient() em client.ts: testes mockam
// globalThis.fetch sem precisar de seam de injeção de dependência.
//
// Client id/secret e o segredo de assinatura de webhook são da PLATAFORMA
// (únicos, não por tenant) -- o que varia por tenant é o access_token
// devolvido pelo OAuth (ver payments/providers/mercadopago/oauth.ts e
// services/payments/providerCredentials.ts), armazenado cifrado em
// tenant_payment_integrations.credentials_encrypted.

export const MERCADOPAGO_API_BASE = "https://api.mercadopago.com";

export function getMercadoPagoClientId(): string | undefined {
    const value = String(process.env.MERCADOPAGO_CLIENT_ID ?? "").trim();
    return value || undefined;
}

export function getMercadoPagoClientSecret(): string | undefined {
    const value = String(process.env.MERCADOPAGO_CLIENT_SECRET ?? "").trim();
    return value || undefined;
}

// Secret configurado uma vez no painel do app Mercado Pago (webhooks),
// usado pra verificar o header x-signature -- mesmo papel de
// getConnectWebhookSecretV1() na Stripe.
export function getMercadoPagoWebhookSecret(): string | undefined {
    const value = String(process.env.MERCADOPAGO_WEBHOOK_SECRET ?? "").trim();
    return value || undefined;
}

export function getMercadoPagoApplicationFeeBps(): number {
    const raw = Number(process.env.MERCADOPAGO_APPLICATION_FEE_BPS ?? "0");
    return Number.isFinite(raw) && raw >= 0 ? raw : 0;
}

// URL pública do backend apontando pra si mesmo (api/webhooks/mercadopago/
// oauth-callback) -- categoria de env var nova neste codebase, ver
// services/payments/mercadoPagoOnboardingService.ts. Precisa bater
// exatamente com o redirect_uri cadastrado no painel do app Mercado Pago.
export function getMercadoPagoRedirectUri(): string | undefined {
    const value = String(process.env.MERCADOPAGO_REDIRECT_URI ?? "").trim();
    return value || undefined;
}

// Assina o `state` do fluxo OAuth (ver oauth.ts / mercadoPagoOnboardingService.ts)
// -- segredo próprio, nunca reaproveita PAYMENT_CREDENTIALS_ENCRYPTION_KEY
// (papéis diferentes: um cifra em repouso, o outro assina um valor que
// trafega na URL).
export function getMercadoPagoOAuthStateSecret(): string | undefined {
    const value = String(process.env.MERCADOPAGO_OAUTH_STATE_SECRET ?? "").trim();
    return value || undefined;
}

// O Mercado Pago não expõe um Client ID/Secret separado para teste -- o app
// só tem UM par (mostrado em "Credenciais de produção"), reaproveitado em
// sandbox. Pra testar localmente sem mover dinheiro real, o POST
// /oauth/token aceita `test_token: true`, devolvendo um access_token TEST-
// mesmo usando o client_id/secret de produção (ver oauth.ts::requestToken).
// Ligar isso só em ambiente local -- NUNCA setar em produção (deixaria toda
// conexão de tenant caindo em modo sandbox).
export function isMercadoPagoOAuthTestModeEnabled(): boolean {
    return String(process.env.MERCADOPAGO_OAUTH_TEST_TOKEN ?? "").trim().toLowerCase() === "true";
}
