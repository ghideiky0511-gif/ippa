// Operações de negócio sobre a WhatsApp Cloud API usadas pelo onboarding
// (Embedded Signup) e pelo envio de notificação. Camada fina sobre
// whatsAppGraphRequest — não conhece tenant/vendedora/banco.
//
// Endpoints e formato de payload conferem com a documentação pública da
// Meta no momento em que este arquivo foi escrito (Graph API
// v21.0/Cloud API + Embedded Signup) — como a Graph API versiona e a Meta
// pode ajustar campos, validar contra a documentação vigente antes do
// primeiro envio real (ver "Riscos" no plano de integração).

import type { ExternalApiCallReporter } from "@/lib/externalApiCall";
import { whatsAppGraphRequest } from "./http";
import type {
    WhatsAppCreateTemplateInput,
    WhatsAppCreateTemplateResponse,
    WhatsAppPhoneNumbersResponse,
    WhatsAppSendMessageResponse,
    WhatsAppSendTemplateMessageInput,
    WhatsAppTokenExchangeResponse,
} from "./types";

export interface WhatsAppAppCredentials {
    appId: string;
    appSecret: string;
}

// Troca o `code` retornado pelo JS SDK do Embedded Signup por um access
// token. Para WhatsApp Embedded Signup com um System User de negócio, esse
// token já nasce de longa duração quando o app solicita as permissões
// corretas (whatsapp_business_management, whatsapp_business_messaging) —
// não precisa do passo extra de fb_exchange_token que o login OAuth comum
// exige.
export function exchangeEmbeddedSignupCode(
    code: string,
    app: WhatsAppAppCredentials,
    reporter?: ExternalApiCallReporter,
): Promise<WhatsAppTokenExchangeResponse> {
    return whatsAppGraphRequest<WhatsAppTokenExchangeResponse>("GET", "/oauth/access_token", {
        params: { client_id: app.appId, client_secret: app.appSecret, code },
        operation: "exchangeEmbeddedSignupCode",
        reporter,
    });
}

// Lista os números de telefone vinculados à WABA — usado para descobrir
// `phone_number_id`/`display_phone_number` logo após o Embedded Signup
// devolver o `waba_id`.
export function listWabaPhoneNumbers(
    wabaId: string,
    token: string,
    reporter?: ExternalApiCallReporter,
): Promise<WhatsAppPhoneNumbersResponse> {
    return whatsAppGraphRequest<WhatsAppPhoneNumbersResponse>("GET", `/${wabaId}/phone_numbers`, {
        token,
        operation: "listWabaPhoneNumbers",
        reporter,
    });
}

// Inscreve o app da ippa para receber webhooks (status de mensagem) dessa
// WABA — sem isso a Meta não entrega os callbacks de entrega/leitura/falha.
export function subscribeAppToWaba(
    wabaId: string,
    token: string,
    reporter?: ExternalApiCallReporter,
): Promise<{ success: boolean }> {
    return whatsAppGraphRequest<{ success: boolean }>("POST", `/${wabaId}/subscribed_apps`, {
        token,
        operation: "subscribeAppToWaba",
        reporter,
    });
}

// Registra um message template na WABA — precisa de aprovação da Meta antes
// de poder ser usado em sendTemplateMessage (ver whatsappOnboardingService).
export function createMessageTemplate(
    wabaId: string,
    token: string,
    input: WhatsAppCreateTemplateInput,
    reporter?: ExternalApiCallReporter,
): Promise<WhatsAppCreateTemplateResponse> {
    return whatsAppGraphRequest<WhatsAppCreateTemplateResponse>("POST", `/${wabaId}/message_templates`, {
        token,
        jsonBody: input,
        operation: "createMessageTemplate",
        reporter,
    });
}

// Envia uma mensagem de template para `to` (formato Cloud API: dígitos com
// código de país, sem "+" — ver toWaId em payloadBuilders.ts).
export function sendTemplateMessage(
    phoneNumberId: string,
    token: string,
    input: WhatsAppSendTemplateMessageInput,
    reporter?: ExternalApiCallReporter,
): Promise<WhatsAppSendMessageResponse> {
    return whatsAppGraphRequest<WhatsAppSendMessageResponse>("POST", `/${phoneNumberId}/messages`, {
        token,
        jsonBody: {
            messaging_product: "whatsapp",
            to: input.to,
            type: "template",
            template: {
                name: input.templateName,
                language: { code: input.languageCode },
                ...(input.bodyParameters?.length
                    ? { components: [{ type: "body", parameters: input.bodyParameters }] }
                    : {}),
            },
        },
        operation: "sendTemplateMessage",
        reporter,
    });
}
