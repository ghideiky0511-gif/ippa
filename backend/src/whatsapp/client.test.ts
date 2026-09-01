import assert from "node:assert/strict";
import test from "node:test";
import { sendTemplateMessage, exchangeEmbeddedSignupCode } from "./client";
import { WHATSAPP_GRAPH_BASE_URL } from "./http";
import { WhatsAppAuthError } from "./errors";

test("sendTemplateMessage envia o envelope documentado pela Meta", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = async (input, init) => {
        calls.push({ url: String(input), init });
        return new Response(
            JSON.stringify({
                messaging_product: "whatsapp",
                contacts: [{ input: "5511999999999", wa_id: "5511999999999" }],
                messages: [{ id: "wamid.HBg" }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
        );
    };
    try {
        const response = await sendTemplateMessage("123456", "token-abc", {
            to: "5511999999999",
            templateName: "order_confirmed",
            languageCode: "pt_BR",
            bodyParameters: [{ type: "text", text: "Maria" }],
        });
        assert.equal(response.messages[0].id, "wamid.HBg");
        assert.equal(calls.length, 1);
        assert.equal(calls[0].url, `${WHATSAPP_GRAPH_BASE_URL}/123456/messages`);
        assert.equal((calls[0].init?.headers as Record<string, string>).Authorization, "Bearer token-abc");
        const body = JSON.parse(String(calls[0].init?.body));
        assert.deepEqual(body, {
            messaging_product: "whatsapp",
            to: "5511999999999",
            type: "template",
            template: {
                name: "order_confirmed",
                language: { code: "pt_BR" },
                components: [{ type: "body", parameters: [{ type: "text", text: "Maria" }] }],
            },
        });
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("sendTemplateMessage omite `components` quando não há parâmetros", async () => {
    const originalFetch = globalThis.fetch;
    let capturedBody: unknown;
    globalThis.fetch = async (_input, init) => {
        capturedBody = JSON.parse(String(init?.body));
        return new Response(
            JSON.stringify({ messaging_product: "whatsapp", contacts: [], messages: [{ id: "wamid.X" }] }),
            { status: 200, headers: { "Content-Type": "application/json" } },
        );
    };
    try {
        await sendTemplateMessage("123456", "token-abc", {
            to: "5511999999999",
            templateName: "payment_link",
            languageCode: "pt_BR",
        });
        assert.equal((capturedBody as { template: { components?: unknown } }).template.components, undefined);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("token recusado pela Meta vira WhatsAppAuthError", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
        new Response(
            JSON.stringify({ error: { message: "Invalid OAuth access token.", code: 190 } }),
            { status: 401, headers: { "Content-Type": "application/json" } },
        );
    try {
        await assert.rejects(
            () => exchangeEmbeddedSignupCode("bad-code", { appId: "1", appSecret: "2" }),
            (error: unknown) => {
                assert.ok(error instanceof WhatsAppAuthError);
                assert.equal(error.metaCode, 190);
                return true;
            },
        );
    } finally {
        globalThis.fetch = originalFetch;
    }
});
