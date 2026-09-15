import {
    MERCADOPAGO_API_BASE,
    getMercadoPagoClientId,
    getMercadoPagoClientSecret,
    getMercadoPagoRedirectUri,
    isMercadoPagoOAuthTestModeEnabled,
} from "./client";

// Funções puras de rede (sem banco/tenant), mesma separação que a Stripe
// mantém entre client.ts (acesso cru à API/SDK) e
// services/payments/mercadoPagoOnboardingService.ts (orquestração de
// banco/tenant). [verificar contra a documentação atual do Mercado Pago
// antes de usar em produção]: nomes exatos de campo de POST /oauth/token
// (request e response) -- o shape abaixo é o assumido no plano, não foi
// exercitado contra a API real nesta sessão.

export interface MercadoPagoOAuthTokens {
    accessToken: string;
    refreshToken: string;
    // ISO string -- persistido dentro de credentials_encrypted (JSON), por
    // isso já normalizado pra string em vez de Date (round-trip por
    // JSON.stringify/parse na borda de cifra, ver paymentCredentials.ts).
    expiresAt: string;
    userId: string;
    publicKey: string;
}

interface MercadoPagoOAuthTokenResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    user_id: number | string;
    public_key: string;
}

async function requestToken(body: Record<string, string>): Promise<MercadoPagoOAuthTokens> {
    const clientId = getMercadoPagoClientId();
    const clientSecret = getMercadoPagoClientSecret();
    if (!clientId || !clientSecret) {
        throw new Error("Mercado Pago não configurado (MERCADOPAGO_CLIENT_ID/MERCADOPAGO_CLIENT_SECRET ausentes).");
    }
    const response = await fetch(`${MERCADOPAGO_API_BASE}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            ...body,
            ...(isMercadoPagoOAuthTestModeEnabled() ? { test_token: "true" } : {}),
        }),
    });
    if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Mercado Pago OAuth falhou (${response.status}): ${detail || response.statusText}`);
    }
    const data = (await response.json()) as MercadoPagoOAuthTokenResponse;
    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
        userId: String(data.user_id),
        publicKey: data.public_key,
    };
}

// Troca o `code` recebido no redirect_uri por tokens -- primeira metade do
// fluxo OAuth (a segunda é refreshMercadoPagoAccessToken abaixo, usado
// depois que o access_token original expira). Ver
// mercadoPagoOnboardingService.ts::handleMercadoPagoOAuthCallback.
export async function exchangeMercadoPagoAuthorizationCode(code: string): Promise<MercadoPagoOAuthTokens> {
    const redirectUri = getMercadoPagoRedirectUri();
    if (!redirectUri) throw new Error("Mercado Pago não configurado (MERCADOPAGO_REDIRECT_URI ausente).");
    return requestToken({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
}

// Renova um access_token perto de expirar -- ver
// services/payments/providerCredentials.ts, único lugar que chama isto
// (resolve credenciais na hora de cobrar/reconciliar, regrava o resultado
// cifrado antes de devolver).
export async function refreshMercadoPagoAccessToken(refreshToken: string): Promise<MercadoPagoOAuthTokens> {
    return requestToken({ grant_type: "refresh_token", refresh_token: refreshToken });
}
