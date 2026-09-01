// Tipos de payload/resposta da WhatsApp Cloud API (Graph API da Meta) usados
// pela ippa. Cobre só o que este domínio precisa: troca do `code` do
// Embedded Signup por token, descoberta de número/WABA, registro de message
// template e envio de mensagem de template. Não modela a API inteira.

export interface WhatsAppTokenExchangeResponse {
    access_token: string;
    token_type?: string;
    expires_in?: number;
}

export interface WhatsAppPhoneNumberEntry {
    id: string;
    display_phone_number: string;
    verified_name?: string;
    quality_rating?: string;
}

export interface WhatsAppPhoneNumbersResponse {
    data: WhatsAppPhoneNumberEntry[];
}

export type WhatsAppTemplateCategory = "UTILITY" | "MARKETING" | "AUTHENTICATION";
export type WhatsAppTemplateStatus = "APPROVED" | "PENDING" | "REJECTED" | "PAUSED" | "DISABLED";

export interface WhatsAppTemplateComponent {
    type: "BODY" | "HEADER" | "FOOTER";
    text: string;
}

export interface WhatsAppCreateTemplateInput {
    name: string;
    language: string;
    category: WhatsAppTemplateCategory;
    components: WhatsAppTemplateComponent[];
}

export interface WhatsAppCreateTemplateResponse {
    id: string;
    status: WhatsAppTemplateStatus;
    category: WhatsAppTemplateCategory;
}

export interface WhatsAppTemplateParameter {
    type: "text";
    text: string;
}

export interface WhatsAppSendTemplateMessageInput {
    to: string;
    templateName: string;
    languageCode: string;
    bodyParameters?: WhatsAppTemplateParameter[];
}

export interface WhatsAppSendMessageResponseContact {
    input: string;
    wa_id: string;
}

export interface WhatsAppSendMessageResponseMessage {
    id: string;
}

export interface WhatsAppSendMessageResponse {
    messaging_product: "whatsapp";
    contacts: WhatsAppSendMessageResponseContact[];
    messages: WhatsAppSendMessageResponseMessage[];
}

// Payload de erro padrão do Graph API -- ver
// https://developers.facebook.com/docs/graph-api/guides/error-handling.
export interface WhatsAppApiErrorPayload {
    error?: {
        message: string;
        type?: string;
        code?: number;
        error_subcode?: number;
        error_data?: { details?: string };
        fbtrace_id?: string;
    };
}

// Callback de status de mensagem recebido no webhook (delivery/read/failed).
// A Meta envelopa em `entry[].changes[].value` -- ver
// https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples#status--object.
export interface WhatsAppWebhookStatusEntry {
    id: string; // wa_message_id
    status: "sent" | "delivered" | "read" | "failed";
    timestamp: string;
    recipient_id: string;
    errors?: Array<{ code: number; title: string; message?: string }>;
}

export interface WhatsAppWebhookChangeValue {
    metadata?: { phone_number_id: string; display_phone_number?: string };
    statuses?: WhatsAppWebhookStatusEntry[];
}

export interface WhatsAppWebhookPayload {
    object: string;
    entry: Array<{
        id: string; // waba_id
        changes: Array<{ field: string; value: WhatsAppWebhookChangeValue }>;
    }>;
}
