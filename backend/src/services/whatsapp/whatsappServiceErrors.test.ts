import assert from "node:assert/strict";
import test from "node:test";
import { BippaMessagingAuthError, BippaMessagingClientError } from "@/messaging/errors";
import { ValidationError } from "@/services/shared/errors";
import { mapBippaMessagingError, senderProfileKeyForSeller } from "./whatsappServiceErrors";

test("senderProfileKeyForSeller deriva a chave do tenant.id + seller.id, sempre no formato catalogo:<tenantId>:<sellerId>", () => {
    assert.equal(senderProfileKeyForSeller("tenant-1", "seller-1"), "catalogo:tenant-1:seller-1");
    assert.equal(senderProfileKeyForSeller("outro-tenant", "outro-seller"), "catalogo:outro-tenant:outro-seller");
});

test("mapBippaMessagingError preserva a mensagem específica do bippa-messaging", () => {
    const upstream = new BippaMessagingClientError("Esta instalação pertence a outra organização.", { statusCode: 422 });
    const mapped = mapBippaMessagingError(upstream, "WHATSAPP_INSTALLATION_FAILED", "mensagem genérica de fallback");
    assert.ok(mapped instanceof ValidationError);
    assert.equal(mapped.code, "WHATSAPP_INSTALLATION_FAILED");
    assert.equal(mapped.message, "Esta instalação pertence a outra organização.");
});

test("mapBippaMessagingError cai no fallback genérico para erros não tipados (ex.: falha de rede)", () => {
    const mapped = mapBippaMessagingError(new Error("ECONNRESET"), "WHATSAPP_ONBOARDING_FAILED", "Não foi possível iniciar a conexão com o WhatsApp.");
    assert.ok(mapped instanceof ValidationError);
    assert.equal(mapped.code, "WHATSAPP_ONBOARDING_FAILED");
    assert.equal(mapped.message, "Não foi possível iniciar a conexão com o WhatsApp.");
});

test("mapBippaMessagingError troca erro de autenticação (401/403) do bippa-messaging por mensagem amigável, nunca o texto técnico bruto", () => {
    const upstream = new BippaMessagingAuthError("unauthorized", { statusCode: 401 });
    const mapped = mapBippaMessagingError(upstream, "WHATSAPP_INSTALLATION_FAILED", "mensagem genérica de fallback");
    assert.ok(mapped instanceof ValidationError);
    assert.equal(mapped.code, "WHATSAPP_INSTALLATION_FAILED");
    assert.notEqual(mapped.message, "unauthorized");
    assert.match(mapped.message, /fale com o suporte/i);
});

test("mapBippaMessagingError nunca deixa o erro original vazar sem virar ValidationError", () => {
    const mapped = mapBippaMessagingError("qualquer coisa não-Error", "WHATSAPP_CONNECTIONS_UNAVAILABLE", "fallback");
    assert.ok(mapped instanceof ValidationError);
    assert.equal(mapped.status, 400);
});
