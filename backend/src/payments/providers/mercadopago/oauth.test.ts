import assert from "node:assert/strict";
import test from "node:test";
import { exchangeMercadoPagoAuthorizationCode, refreshMercadoPagoAccessToken } from "./oauth";

process.env.MERCADOPAGO_CLIENT_ID = "client-id";
process.env.MERCADOPAGO_CLIENT_SECRET = "client-secret";
process.env.MERCADOPAGO_REDIRECT_URI = "https://backend.example.com/api/webhooks/mercadopago/oauth-callback";

function mockFetchOnce(handler: (url: string, init?: RequestInit) => Response) {
    const previous = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) =>
        handler(String(input), init)) as typeof fetch;
    return {
        restore: () => {
            globalThis.fetch = previous;
        },
    };
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

test("exchangeMercadoPagoAuthorizationCode troca code por tokens", async () => {
    const mock = mockFetchOnce((url, init) => {
        assert.equal(url, "https://api.mercadopago.com/oauth/token");
        const body = JSON.parse(String(init?.body));
        assert.equal(body.grant_type, "authorization_code");
        assert.equal(body.code, "auth-code-1");
        assert.equal(body.client_id, "client-id");
        assert.equal(body.client_secret, "client-secret");
        assert.equal(body.redirect_uri, "https://backend.example.com/api/webhooks/mercadopago/oauth-callback");
        return jsonResponse({
            access_token: "APP_USR-abc",
            refresh_token: "TG-refresh-abc",
            expires_in: 15552000,
            user_id: 999,
            public_key: "APP_USR-pubkey",
        });
    });
    try {
        const tokens = await exchangeMercadoPagoAuthorizationCode("auth-code-1");
        assert.equal(tokens.accessToken, "APP_USR-abc");
        assert.equal(tokens.refreshToken, "TG-refresh-abc");
        assert.equal(tokens.userId, "999");
        assert.equal(tokens.publicKey, "APP_USR-pubkey");
        assert.ok(new Date(tokens.expiresAt).getTime() > Date.now());
    } finally {
        mock.restore();
    }
});

test("refreshMercadoPagoAccessToken renova com grant_type refresh_token", async () => {
    const mock = mockFetchOnce((_url, init) => {
        const body = JSON.parse(String(init?.body));
        assert.equal(body.grant_type, "refresh_token");
        assert.equal(body.refresh_token, "TG-refresh-old");
        return jsonResponse({
            access_token: "APP_USR-new",
            refresh_token: "TG-refresh-new",
            expires_in: 15552000,
            user_id: 999,
            public_key: "APP_USR-pubkey",
        });
    });
    try {
        const tokens = await refreshMercadoPagoAccessToken("TG-refresh-old");
        assert.equal(tokens.accessToken, "APP_USR-new");
        assert.equal(tokens.refreshToken, "TG-refresh-new");
    } finally {
        mock.restore();
    }
});

test("exchangeMercadoPagoAuthorizationCode lança em resposta de erro", async () => {
    const mock = mockFetchOnce(() => jsonResponse({ message: "invalid_grant" }, 400));
    try {
        await assert.rejects(() => exchangeMercadoPagoAuthorizationCode("bad-code"), /falhou \(400\)/);
    } finally {
        mock.restore();
    }
});

test("exchangeMercadoPagoAuthorizationCode envia test_token quando MERCADOPAGO_OAUTH_TEST_TOKEN=true", async () => {
    process.env.MERCADOPAGO_OAUTH_TEST_TOKEN = "true";
    const mock = mockFetchOnce((_url, init) => {
        const body = JSON.parse(String(init?.body));
        assert.equal(body.test_token, "true");
        return jsonResponse({
            access_token: "TEST-abc",
            refresh_token: "TG-refresh-test",
            expires_in: 15552000,
            user_id: 999,
            public_key: "TEST-pubkey",
        });
    });
    try {
        const tokens = await exchangeMercadoPagoAuthorizationCode("auth-code-2");
        assert.equal(tokens.accessToken, "TEST-abc");
    } finally {
        mock.restore();
        delete process.env.MERCADOPAGO_OAUTH_TEST_TOKEN;
    }
});
