import assert from "node:assert/strict";
import test from "node:test";
import { BippaMessagingAuthError, BippaMessagingClientError } from "@/messaging/errors";
import { ValidationError } from "@/services/shared/errors";
import { mapBippaMessagingError, metaGraphErrorMeta, senderProfileKeyForSeller } from "./whatsappServiceErrors";

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

test("metaGraphErrorMeta extrai meta_code/meta_subcode/meta_trace_id/meta_error_data_details/meta_error_user_title/meta_error_user_msg do payload do bippa-messaging", () => {
    const upstream = new BippaMessagingClientError("A Meta recusou a operacao solicitada. Invalid parameter", {
        statusCode: 422,
        payload: {
            error: "meta_graph_error",
            message: "A Meta recusou a operacao solicitada. Invalid parameter",
            meta_code: 100,
            meta_subcode: 2388024,
            meta_trace_id: "AdZYloeQRIfkJPycJLmLvCO",
            meta_error_data_details: "Body parameter at index 3 contains a URL",
            meta_error_user_title: "Message template components param is invalid",
            meta_error_user_msg: "component of type BUTTONS has an invalid field",
        },
    });
    assert.deepEqual(metaGraphErrorMeta(upstream), {
        metaCode: 100,
        metaSubcode: 2388024,
        metaTraceId: "AdZYloeQRIfkJPycJLmLvCO",
        metaErrorDataDetails: "Body parameter at index 3 contains a URL",
        metaErrorUserTitle: "Message template components param is invalid",
        metaErrorUserMsg: "component of type BUTTONS has an invalid field",
    });
});

test("metaGraphErrorMeta devolve objeto vazio quando o erro não é um BippaMessagingClientError ou não tem payload", () => {
    assert.deepEqual(metaGraphErrorMeta(new Error("ECONNRESET")), {});
    assert.deepEqual(metaGraphErrorMeta(new BippaMessagingClientError("sem payload", { statusCode: 500 })), {});
});
