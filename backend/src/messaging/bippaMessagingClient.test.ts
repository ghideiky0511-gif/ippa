import assert from "node:assert/strict";
import test from "node:test";
import {
    associateSenderProfile,
    bindTemplateToSenderProfile,
    createWabaTemplate,
    dispatchPaymentOrder,
    dispatchTemplateMessage,
    dispatchTemplateWithUrlButton,
    ensureApplicationInstallation,
    listWabaTemplates,
    listWhatsAppConnections,
    setPaymentsCapability,
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
                            // id da CONEXÃO/WABA -- propositalmente diferente do id do
                            // telefone abaixo, pra pegar uma regressão de quem lê o
                            // nível errado (bug real em produção: 2026-09-09).
                            id: "connection-1",
                            waba_id: "waba-1",
                            status: "connected",
                            health_can_send_message: "LIMITED",
                            health_issues: [{
                                entity_type: "WABA",
                                can_send_message: "LIMITED",
                                errors: [{
                                    code: 141006,
                                    message: "There is an error with the payment method.",
                                    possible_solution: "Add a valid payment method.",
                                }],
                            }],
                            health_checked_at: "2026-09-10T16:00:00.000Z",
                            health_manage_url: "https://business.facebook.com/wa/manage/home/?waba_id=waba-1",
                            health_payment_settings_url: "https://business.facebook.com/settings/payment-methods?business_id=business-1",
                            phones: [
                                {
                                    id: "phone-1",
                                    phone_number_id: "meta-phone-1",
                                    display_phone_number: "+55 11 99999-9999",
                                    verified_name: "Loja Teste",
                                    quality_rating: "GREEN",
                                    active: true,
                                    name_status: "APPROVED",
                                    platform_type: "CLOUD_API",
                                    code_verification_status: "VERIFIED",
                                    messaging_limit_tier: "TIER_1K",
                                    sender_profile_key: "seller:17",
                                    external_reference: "seller-1",
                                    capability_payments: false,
                                },
                            ],
                        },
                    ],
                }),
                { status: 200, headers: { "Content-Type": "application/json" } },
            );
        },
        async () => {
            const result = await listWhatsAppConnections("bippa_key123_segredo", "tenant-1");
            assert.deepEqual(result, [
                {
                    phoneId: "phone-1",
                    phoneNumberId: "meta-phone-1",
                    displayPhoneMasked: "+55 11 99999-9999",
                    verifiedName: "Loja Teste",
                    qualityRating: "GREEN",
                    active: true,
                    nameStatus: "APPROVED",
                    platformType: "CLOUD_API",
                    codeVerificationStatus: "VERIFIED",
                    messagingLimitTier: "TIER_1K",
                    senderProfileKey: "seller:17",
                    externalReference: "seller-1",
                    capabilityPayments: false,
                    wabaId: "waba-1",
                    connectionId: "connection-1",
                    status: "connected",
                    connectionStatus: "connected",
                    healthCanSendMessage: "LIMITED",
                    healthIssues: [{
                        entityType: "WABA",
                        canSendMessage: "LIMITED",
                        errors: [{
                            code: 141006,
                            message: "There is an error with the payment method.",
                            possibleSolution: "Add a valid payment method.",
                        }],
                    }],
                    healthCheckedAt: "2026-09-10T16:00:00.000Z",
                    healthManageUrl: "https://business.facebook.com/wa/manage/home/?waba_id=waba-1",
                    healthPaymentSettingsUrl: "https://business.facebook.com/settings/payment-methods?business_id=business-1",
                },
            ]);
            assert.equal(calls[0].url, `${DEFAULT_BASE_URL}/v1/admin/whatsapp-connections?source_reference=tenant-1`);
        },
    );
});

test("listWabaTemplates consulta a WABA selecionada e preserva o status da Meta", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    await withFetch(
        async (input, init) => {
            calls.push({ url: String(input), init });
            return new Response(
                JSON.stringify({
                    data: [{
                        id: "template-local-1",
                        organization_id: "org-1",
                        waba_id: "waba-1",
                        meta_template_id: "meta-template-1",
                        name: "bippa_order_confirmed_v3",
                        language: "pt_BR",
                        category: "UTILITY",
                        status: "APPROVED",
                        quality_score: "GREEN",
                        rejection_reason: null,
                        components: [{ type: "BODY", text: "Olá {{1}}" }],
                        last_synced_at: "2026-09-10T12:00:00.000Z",
                    }],
                }),
                { status: 200, headers: { "Content-Type": "application/json" } },
            );
        },
        async () => {
            const result = await listWabaTemplates("bippa_key123_segredo", "waba-1", "tenant-1", true);
            assert.deepEqual(result, [{
                id: "template-local-1",
                organizationId: "org-1",
                wabaId: "waba-1",
                metaTemplateId: "meta-template-1",
                name: "bippa_order_confirmed_v3",
                language: "pt_BR",
                category: "UTILITY",
                status: "APPROVED",
                qualityScore: "GREEN",
                rejectionReason: null,
                components: [{ type: "BODY", text: "Olá {{1}}" }],
                lastSyncedAt: "2026-09-10T12:00:00.000Z",
            }]);
            assert.equal(
                calls[0].url,
                `${DEFAULT_BASE_URL}/v1/admin/connections/waba-1/templates?source_reference=tenant-1&sync=true`,
            );
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
                    sender_profile: {
                        id: "sp-1",
                        organization_id: "org-1",
                        phone_id: "phone-1",
                        key: "catalogo:tenant-1",
                        external_reference: "seller-1",
                        connection_id: "conn-1",
                    },
                }),
                { status: 200, headers: { "Content-Type": "application/json" } },
            );
        },
        async () => {
            const result = await associateSenderProfile("bippa_key123_segredo", "phone-1", {
                sourceReference: "tenant-1",
                externalReference: "seller-1",
                senderProfileKey: "catalogo:tenant-1",
            });
            assert.equal(calls[0].url, `${DEFAULT_BASE_URL}/v1/admin/phones/phone-1/sender-profile`);
            assert.equal(calls[0].init?.method, "PATCH");
            const body = JSON.parse(String(calls[0].init?.body));
            assert.deepEqual(body, {
                source_reference: "tenant-1",
                external_reference: "seller-1",
                sender_profile_key: "catalogo:tenant-1",
            });
            assert.equal(result.phoneId, "phone-1");
            assert.equal(result.senderProfileId, "sp-1");
            assert.equal(result.connectionId, "conn-1");
            assert.equal(result.senderProfileKey, "catalogo:tenant-1");
            assert.equal(result.capabilityPayments, null);
        },
    );
});

test("setPaymentsCapability chama a rota dedicada", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    await withFetch(
        async (input, init) => {
            calls.push({ url: String(input), init });
            return new Response(JSON.stringify({ sender_profile: { capability_payments: true } }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        },
        async () => {
            const result = await setPaymentsCapability("bippa_key123_segredo", "sp-1", {
                sourceReference: "tenant-1",
                capabilityPayments: true,
                reason: "Meta aprovou Orders/Payments em 2026-09-10",
                actorReference: "admin-1",
            });
            assert.equal(calls[0].url, `${DEFAULT_BASE_URL}/v1/admin/sender-profiles/sp-1/payments-capability`);
            assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
                source_reference: "tenant-1",
                capability_payments: true,
                reason: "Meta aprovou Orders/Payments em 2026-09-10",
                actor_reference: "admin-1",
            });
            assert.equal(result.capabilityPayments, true);
        },
    );
});

test("createWabaTemplate cria o template na WABA (não no telefone)", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    await withFetch(
        async (input, init) => {
            calls.push({ url: String(input), init });
            return new Response(
                JSON.stringify({
                    template: { id: "tpl-1", name: "bippa_order_confirmed_v1", status: "PENDING", category: "UTILITY", language: "pt_BR" },
                }),
                { status: 201, headers: { "Content-Type": "application/json" } },
            );
        },
        async () => {
            const result = await createWabaTemplate("bippa_key123_segredo", "waba-1", {
                sourceReference: "tenant-1",
                name: "bippa_order_confirmed_v1",
                category: "UTILITY",
                languageCode: "pt_BR",
                body: "Olá, {{1}}. Pedido {{2}}.",
                bodyExamples: ["Maria", "1234"],
            });
            assert.equal(calls[0].url, `${DEFAULT_BASE_URL}/v1/admin/connections/waba-1/templates`);
            assert.equal(calls[0].init?.method, "POST");
            assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
                source_reference: "tenant-1",
                name: "bippa_order_confirmed_v1",
                language: "pt_BR",
                category: "UTILITY",
                components: [{
                    type: "BODY",
                    text: "Olá, {{1}}. Pedido {{2}}.",
                    example: { body_text: [["Maria", "1234"]] },
                }],
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

test("createWabaTemplate adiciona um componente BUTTONS quando o template tem link dinâmico", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    await withFetch(
        async (input, init) => {
            calls.push({ url: String(input), init });
            return new Response(
                JSON.stringify({
                    template: { id: "tpl-1", name: "bippa_order_confirmed_v2", status: "PENDING", category: "UTILITY", language: "pt_BR" },
                }),
                { status: 201, headers: { "Content-Type": "application/json" } },
            );
        },
        async () => {
            await createWabaTemplate("bippa_key123_segredo", "waba-1", {
                sourceReference: "tenant-1",
                name: "bippa_order_confirmed_v2",
                category: "UTILITY",
                languageCode: "pt_BR",
                body: "Olá, {{1}}. Pedido {{2}}.",
                bodyExamples: ["Maria", "1234"],
                button: {
                    text: "Ver pedido",
                    urlTemplate: "http://localhost:3015/{{1}}",
                    example: "loja/pedidos/1234",
                },
            });
            assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
                source_reference: "tenant-1",
                name: "bippa_order_confirmed_v2",
                language: "pt_BR",
                category: "UTILITY",
                components: [
                    {
                        type: "BODY",
                        text: "Olá, {{1}}. Pedido {{2}}.",
                        example: { body_text: [["Maria", "1234"]] },
                    },
                    {
                        type: "BUTTONS",
                        buttons: [
                            {
                                type: "URL",
                                text: "Ver pedido",
                                url: "http://localhost:3015/{{1}}",
                                example: ["http://localhost:3015/loja/pedidos/1234"],
                            },
                        ],
                    },
                ],
            });
        },
    );
});

test("bindTemplateToSenderProfile vincula um template já criado sob uma template_key", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    await withFetch(
        async (input, init) => {
            calls.push({ url: String(input), init });
            return new Response(
                JSON.stringify({ id: "bind-1", sender_profile_id: "sp-1", template_id: "tpl-1", template_key: "order_confirmed", status: "APPROVED" }),
                { status: 201, headers: { "Content-Type": "application/json" } },
            );
        },
        async () => {
            const result = await bindTemplateToSenderProfile("bippa_key123_segredo", "sp-1", {
                sourceReference: "tenant-1",
                templateId: "tpl-1",
                templateKey: "order_confirmed",
            });
            assert.equal(calls[0].url, `${DEFAULT_BASE_URL}/v1/admin/sender-profiles/sp-1/template-bindings`);
            assert.equal(calls[0].init?.method, "POST");
            assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
                source_reference: "tenant-1",
                template_id: "tpl-1",
                template_key: "order_confirmed",
            });
            assert.deepEqual(result, {
                id: "bind-1",
                senderProfileId: "sp-1",
                templateId: "tpl-1",
                templateKey: "order_confirmed",
                status: "APPROVED",
            });
        },
    );
});

test("dispatchTemplateMessage envia source_reference/seller_reference/idempotency_key/kind/payload para POST /v1/dispatches", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    await withFetch(
        async (input, init) => {
            calls.push({ url: String(input), init });
            return new Response(
                JSON.stringify({ dispatch: { id: "dispatch-1", status: "queued" }, duplicate: false }),
                { status: 202, headers: { "Content-Type": "application/json" } },
            );
        },
        async () => {
            const result = await dispatchTemplateMessage("bippa_key123_segredo", {
                sourceReference: "tenant-1",
                sellerReference: "seller-1",
                to: "5511999999999",
                idempotencyKey: "bippa-catalogo:tenant-1:seller:seller-1:order:9081:confirmed",
                templateKey: "order_confirmed",
                params: { "1": "Maria", "2": "123" },
            });
            assert.deepEqual(result, { id: "dispatch-1", duplicate: false });
            assert.equal(calls[0].url, `${DEFAULT_BASE_URL}/v1/dispatches`);
            assert.equal((calls[0].init?.headers as Record<string, string>)["X-Bippa-Api-Key"], "bippa_key123_segredo");
            const body = JSON.parse(String(calls[0].init?.body));
            assert.deepEqual(body, {
                source_reference: "tenant-1",
                seller_reference: "seller-1",
                recipient: "5511999999999",
                kind: "template",
                idempotency_key: "bippa-catalogo:tenant-1:seller:seller-1:order:9081:confirmed",
                payload: { template_key: "order_confirmed", params: { "1": "Maria", "2": "123" } },
            });
        },
    );
});

test("dispatchTemplateWithUrlButton envia payload.template bruto com body e botão URL", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    await withFetch(
        async (input, init) => {
            calls.push({ url: String(input), init });
            return new Response(
                JSON.stringify({ dispatch: { id: "dispatch-1", status: "queued" }, duplicate: false }),
                { status: 202, headers: { "Content-Type": "application/json" } },
            );
        },
        async () => {
            const result = await dispatchTemplateWithUrlButton("bippa_key123_segredo", {
                sourceReference: "tenant-1",
                sellerReference: "seller-1",
                to: "5511999999999",
                idempotencyKey: "bippa-catalogo:tenant-1:seller:seller-1:order:9081:confirmed",
                templateName: "bippa_order_confirmed_v2",
                languageCode: "pt_BR",
                bodyParams: ["Maria", "1234"],
                buttonParam: "loja/pedidos/1234",
            });
            assert.deepEqual(result, { id: "dispatch-1", duplicate: false });
            assert.equal(calls[0].url, `${DEFAULT_BASE_URL}/v1/dispatches`);
            const body = JSON.parse(String(calls[0].init?.body));
            assert.deepEqual(body, {
                source_reference: "tenant-1",
                seller_reference: "seller-1",
                recipient: "5511999999999",
                kind: "template",
                idempotency_key: "bippa-catalogo:tenant-1:seller:seller-1:order:9081:confirmed",
                payload: {
                    template: {
                        name: "bippa_order_confirmed_v2",
                        language: { code: "pt_BR" },
                        components: [
                            {
                                type: "body",
                                parameters: [
                                    { type: "text", text: "Maria" },
                                    { type: "text", text: "1234" },
                                ],
                            },
                            {
                                type: "button",
                                sub_type: "url",
                                index: "0",
                                parameters: [{ type: "text", text: "loja/pedidos/1234" }],
                            },
                        ],
                    },
                },
            });
        },
    );
});

test("dispatchPaymentOrder envia payment.methods.pix_dynamic_code e items para POST /v1/payment-orders", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    await withFetch(
        async (input, init) => {
            calls.push({ url: String(input), init });
            return new Response(
                JSON.stringify({
                    payment_order: { reference_id: "order-1", total_amount: 5000 },
                    dispatch: { id: "dispatch-1", status: "queued" },
                    duplicate: false,
                }),
                { status: 202, headers: { "Content-Type": "application/json" } },
            );
        },
        async () => {
            const result = await dispatchPaymentOrder("bippa_key123_segredo", {
                sourceReference: "tenant-1",
                sellerReference: "seller-1",
                to: "5511999999999",
                idempotencyKey: "bippa-catalogo:tenant-1:seller:seller-1:order:order-1:payment-order:manual:uuid-1",
                referenceId: "order-1",
                items: [{ retailerId: "item-1", name: "Produto", unitAmount: 5000, quantity: 1 }],
                taxAmount: 0,
                totalAmount: 5000,
                pix: { code: "copia-e-cola-gerado-pelo-psp", merchantName: "Minha Loja", key: "chave-pix", keyType: "EVP" },
            });
            assert.deepEqual(result, { id: "dispatch-1", duplicate: false });
            assert.equal(calls[0].url, `${DEFAULT_BASE_URL}/v1/payment-orders`);
            const body = JSON.parse(String(calls[0].init?.body));
            assert.deepEqual(body, {
                source_reference: "tenant-1",
                seller_reference: "seller-1",
                recipient: "5511999999999",
                idempotency_key: "bippa-catalogo:tenant-1:seller:seller-1:order:order-1:payment-order:manual:uuid-1",
                reference_id: "order-1",
                goods_type: "physical-goods",
                payment: {
                    methods: [
                        {
                            type: "pix_dynamic_code",
                            pix_dynamic_code: {
                                code: "copia-e-cola-gerado-pelo-psp",
                                merchant_name: "Minha Loja",
                                key: "chave-pix",
                                key_type: "EVP",
                            },
                        },
                    ],
                },
                items: [{ retailer_id: "item-1", name: "Produto", unit_amount: 5000, quantity: 1 }],
                tax_amount: 0,
                total_amount: 5000,
            });
        },
    );
});

test("dispatchPaymentOrder envia shipping_amount e discount_amount quando o pedido tem frete/desconto", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    await withFetch(
        async (input, init) => {
            calls.push({ url: String(input), init });
            return new Response(
                JSON.stringify({
                    payment_order: { reference_id: "order-1", total_amount: 5500 },
                    dispatch: { id: "dispatch-1", status: "queued" },
                    duplicate: false,
                }),
                { status: 202, headers: { "Content-Type": "application/json" } },
            );
        },
        async () => {
            await dispatchPaymentOrder("bippa_key123_segredo", {
                sourceReference: "tenant-1",
                sellerReference: "seller-1",
                to: "5511999999999",
                idempotencyKey: "bippa-catalogo:tenant-1:seller:seller-1:order:order-1:payment-order:manual:uuid-1",
                referenceId: "order-1",
                items: [{ retailerId: "item-1", name: "Produto", unitAmount: 5000, quantity: 1 }],
                taxAmount: 0,
                totalAmount: 5500,
                shippingAmount: 1000,
                shippingDescription: "Entrega padrão",
                discountAmount: 500,
                discountDescription: "Cupom",
                pix: { code: "copia-e-cola-gerado-pelo-psp", merchantName: "Minha Loja", key: "chave-pix", keyType: "EVP" },
            });
            const body = JSON.parse(String(calls[0].init?.body));
            assert.equal(body.shipping_amount, 1000);
            assert.equal(body.shipping_description, "Entrega padrão");
            assert.equal(body.discount_amount, 500);
            assert.equal(body.discount_description, "Cupom");
            assert.equal(body.total_amount, 5500);
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
