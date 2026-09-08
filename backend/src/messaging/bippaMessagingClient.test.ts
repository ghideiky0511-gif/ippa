import assert from "node:assert/strict";
import test from "node:test";
import {
    associateSenderProfile,
    createMessageTemplate,
    ensureApplicationInstallation,
    listWhatsAppConnections,
    sendMessage,
    startOnboardingAttempt,
} from "./bippaMessagingClient";
import { BippaMessagingAuthError, BippaMessagingClientError } from "./errors";

const DEFAULT_BASE_URL = "https://bippa-messaging.onrender.com";

function withFetch(handler: typeof globalThis.fetch, run: () => Promise<void>): Promise<void> {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = handler;
    return run().finally(() => {
        globalThis.fetch = originalFetch;
    });
}

test("ensureApplicationInstallation envia source_reference/organization_name (sem application_code) e mapeia a resposta de /provision", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    await withFetch(
        async (input, init) => {
            calls.push({ url: String(input), init });
            return new Response(
                JSON.stringify({
                    organization: { id: "org-1", name: "Loja Teste" },
                    installation: { id: "inst-1", application_code: "bippa-catalogo", external_reference: "tenant-1", created: true },
                }),
                { status: 201, headers: { "Content-Type": "application/json" } },
            );
        },
        async () => {
            const result = await ensureApplicationInstallation("bippa_key123_segredo", {
                sourceReference: "tenant-1",
                organizationName: "Loja Teste",
            });
            assert.deepEqual(result, { id: "inst-1", externalReference: "tenant-1", created: true, organizationId: "org-1" });
            assert.equal(calls.length, 1);
            assert.equal(calls[0].url, `${DEFAULT_BASE_URL}/v1/admin/application-installations/provision`);
            assert.equal((calls[0].init?.headers as Record<string, string>)["X-Bippa-Api-Key"], "bippa_key123_segredo");
            const body = JSON.parse(String(calls[0].init?.body));
            assert.deepEqual(body, { source_reference: "tenant-1", organization_name: "Loja Teste" });
        },
    );
});

test("startOnboardingAttempt envia actor_reference e mapeia attempt_id/state/expires_at/sdk", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    await withFetch(
        async (input, init) => {
            calls.push({ url: String(input), init });
            return new Response(
                JSON.stringify({
                    onboarding: {
                        attempt_id: "attempt-1",
                        state: "state-xyz",
                        expires_at: "2026-09-08T12:10:00.000Z",
                        connect_url: "https://bippa-messaging.onrender.com/meta/embedded-signup",
                        callback_url: "https://bippa-messaging.onrender.com/meta/oauth/callback",
                        sdk: { app_id: "app-1", config_id: "config-1", graph_api_version: "v21.0" },
                    },
                }),
                { status: 201, headers: { "Content-Type": "application/json" } },
            );
        },
        async () => {
            const result = await startOnboardingAttempt("bippa_key123_segredo", {
                applicationCode: "bippa-catalogo",
                sourceReference: "tenant-1:seller-1",
                actorReference: "admin-1",
                destinationKey: "catalogo-whatsapp-settings",
            });
            assert.deepEqual(result, {
                attemptId: "attempt-1",
                connectUrl: "https://bippa-messaging.onrender.com/meta/embedded-signup",
                state: "state-xyz",
                expiresAt: "2026-09-08T12:10:00.000Z",
                sdk: { appId: "app-1", configId: "config-1", graphApiVersion: "v21.0", extras: {} },
            });
            const body = JSON.parse(String(calls[0].init?.body));
            assert.deepEqual(body, {
                application_code: "bippa-catalogo",
                source_reference: "tenant-1:seller-1",
                actor_reference: "admin-1",
                destination_key: "catalogo-whatsapp-settings",
            });
        },
    );
});

test("listWhatsAppConnections manda source_reference como query param e mapeia snake_case para camelCase", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    await withFetch(
        async (input, init) => {
            calls.push({ url: String(input), init });
            return new Response(
                JSON.stringify({
                    data: [
                        {
                            phone_id: "phone-1",
                            display_phone_masked: "+55 11 9****-9999",
                            verified_name: "Loja Teste",
                            quality_rating: "GREEN",
                            sender_profile_key: null,
                            status: "connected",
                        },
                    ],
                }),
                { status: 200, headers: { "Content-Type": "application/json" } },
            );
        },
        async () => {
            const result = await listWhatsAppConnections("bippa_key123_segredo", "tenant-1:seller-1");
            assert.deepEqual(result, [
                {
                    phoneId: "phone-1",
                    displayPhoneMasked: "+55 11 9****-9999",
                    verifiedName: "Loja Teste",
                    qualityRating: "GREEN",
                    senderProfileKey: null,
                    status: "connected",
                },
            ]);
            assert.equal(calls[0].url, `${DEFAULT_BASE_URL}/v1/admin/whatsapp-connections?source_reference=tenant-1%3Aseller-1`);
        },
    );
});

test("associateSenderProfile chama PATCH /v1/admin/phones/:phoneId/sender-profile", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    await withFetch(
        async (input, init) => {
            calls.push({ url: String(input), init });
            return new Response(
                JSON.stringify({
                    phone_id: "phone-1",
                    sender_profile_key: "catalogo:tenant-1",
                    capability_payments: false,
                    display_phone_masked: "+55 11 9****-9999",
                    verified_name: "Loja Teste",
                    quality_rating: "GREEN",
                    status: "connected",
                }),
                { status: 200, headers: { "Content-Type": "application/json" } },
            );
        },
        async () => {
            const result = await associateSenderProfile("bippa_key123_segredo", "phone-1", {
                externalReference: "tenant-1",
                senderProfileKey: "catalogo:tenant-1",
                capabilityPayments: false,
            });
            assert.equal(calls[0].url, `${DEFAULT_BASE_URL}/v1/admin/phones/phone-1/sender-profile`);
            assert.equal(calls[0].init?.method, "PATCH");
            const body = JSON.parse(String(calls[0].init?.body));
            assert.deepEqual(body, {
                external_reference: "tenant-1",
                sender_profile_key: "catalogo:tenant-1",
                capability_payments: false,
            });
            assert.equal(result.phoneId, "phone-1");
            assert.equal(result.capabilityPayments, false);
        },
    );
});

test("createMessageTemplate envia somente a definição controlada para o WABA do telefone", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    await withFetch(
        async (input, init) => {
            calls.push({ url: String(input), init });
            return new Response(
                JSON.stringify({ template: { id: "tpl-1", name: "bippa_order_confirmed_v1", status: "PENDING", category: "UTILITY", language: "pt_BR" } }),
                { status: 201, headers: { "Content-Type": "application/json" } },
            );
        },
        async () => {
            const result = await createMessageTemplate("bippa_key123_segredo", "phone/1", {
                sourceReference: "tenant-1:seller-1",
                senderProfile: "catalogo:tenant-1:seller-1",
                name: "bippa_order_confirmed_v1",
                category: "UTILITY",
                languageCode: "pt_BR",
                body: "Olá, {{1}}. Pedido {{2}}.",
                bodyExamples: ["Maria", "1234"],
            });
            assert.equal(calls[0].url, `${DEFAULT_BASE_URL}/v1/admin/phones/phone%2F1/message-templates`);
            assert.equal(calls[0].init?.method, "POST");
            assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
                source_reference: "tenant-1:seller-1",
                sender_profile: "catalogo:tenant-1:seller-1",
                template: {
                    name: "bippa_order_confirmed_v1",
                    category: "UTILITY",
                    language: "pt_BR",
                    allow_category_change: false,
                    components: [{
                        type: "BODY",
                        text: "Olá, {{1}}. Pedido {{2}}.",
                        example: { body_text: [["Maria", "1234"]] },
                    }],
                },
            });
            assert.deepEqual(result, {
                id: "tpl-1",
                name: "bippa_order_confirmed_v1",
                status: "PENDING",
                category: "UTILITY",
                languageCode: "pt_BR",
            });
        },
    );
});

test("sendMessage envia source_reference/sender_profile/to/template com a API key de serviço", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    await withFetch(
        async (input, init) => {
            calls.push({ url: String(input), init });
            return new Response(JSON.stringify({ id: "msg-1" }), { status: 200, headers: { "Content-Type": "application/json" } });
        },
        async () => {
            const result = await sendMessage("bippa_key123_segredo", {
                sourceReference: "tenant-1",
                senderProfile: "catalogo:tenant-1",
                to: "5511999999999",
                template: { name: "order_confirmed", languageCode: "pt_BR", bodyParameters: ["Maria", "123"] },
            });
            assert.equal(result.id, "msg-1");
            assert.equal(calls[0].url, `${DEFAULT_BASE_URL}/v1/messages`);
            assert.equal((calls[0].init?.headers as Record<string, string>)["X-Bippa-Api-Key"], "bippa_key123_segredo");
            const body = JSON.parse(String(calls[0].init?.body));
            assert.deepEqual(body, {
                source_reference: "tenant-1",
                sender_profile: "catalogo:tenant-1",
                to: "5511999999999",
                template: { name: "order_confirmed", languageCode: "pt_BR", bodyParameters: ["Maria", "123"] },
            });
        },
    );
});

test("HTTP 401 vira BippaMessagingAuthError", async () => {
    await withFetch(
        async () =>
            new Response(JSON.stringify({ error: "invalid_token" }), { status: 401, headers: { "Content-Type": "application/json" } }),
        async () => {
            await assert.rejects(
                () => listWhatsAppConnections("bad-token", "tenant-1:seller-1"),
                (error: unknown) => error instanceof BippaMessagingAuthError,
            );
        },
    );
});

test("HTTP 422 vira BippaMessagingClientError com a mensagem do serviço", async () => {
    await withFetch(
        async () =>
            new Response(
                JSON.stringify({ error: "installation_conflict", message: "Esta instalação pertence a outra organização." }),
                { status: 422, headers: { "Content-Type": "application/json" } },
            ),
        async () => {
            await assert.rejects(
                () => ensureApplicationInstallation("human-token", { sourceReference: "tenant-1", organizationName: "Loja Teste" }),
                (error: unknown) => {
                    assert.ok(error instanceof BippaMessagingClientError);
                    assert.ok(!(error instanceof BippaMessagingAuthError));
                    assert.equal(error.message, "installation_conflict");
                    return true;
                },
            );
        },
    );
});
