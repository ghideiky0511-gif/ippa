import { z } from "zod";

export const WhatsAppTemplateKeySchema = z.enum([
    "order_confirmed",
    "payment_link",
]);
export type WhatsAppTemplateKey = z.infer<typeof WhatsAppTemplateKeySchema>;

export const WHATSAPP_TEMPLATE_NAMES = {
    orderConfirmed: "bippa_order_confirmed_v1",
    paymentLink: "bippa_payment_link_v1",
} as const;

// Chave de NEGÓCIO (não o nome real da template na Meta) -- é isso que
// POST /v1/dispatches espera em payload.template_key, resolvido no servidor
// do bippa-messaging via o vínculo criado por bindTemplateToSenderProfile
// (ver whatsappTemplateService.ts). Mesmos valores de
// StandardWhatsAppTemplate.key/WhatsAppTemplateKeySchema, só reexportados
// com nomes legíveis para quem envia mensagem (whatsappNotificationService.ts).
export const WHATSAPP_TEMPLATE_KEYS = {
    orderConfirmed: "order_confirmed",
    paymentLink: "payment_link",
} as const satisfies Record<string, WhatsAppTemplateKey>;

export interface StandardWhatsAppTemplate {
    key: WhatsAppTemplateKey;
    name: string;
    title: string;
    description: string;
    category: "UTILITY";
    languageCode: "pt_BR";
    body: string;
    // `example` aqui é só a SUGESTÃO pré-preenchida no formulário de envio
    // (WhatsAppIntegrationApp.tsx) -- a administradora confirma ou digita
    // outro valor no momento do envio, e é esse valor editado que vai para
    // a Meta (submitStandardWhatsAppTemplate exige um `examples[]` do
    // chamador, nunca usa este campo diretamente). Os placeholders de
    // "order_url"/"payment_url" abaixo (domínio fictício) só aparecem se
    // este catálogo for lido sem tenant; listStandardWhatsAppTemplates
    // (whatsappTemplateService.ts) os substitui pela URL real da loja.
    parameters: Array<{ key: string; label: string; example: string }>;
}

// Catálogo fechado do MVP. O browser escolhe somente a chave lógica; nome,
// texto, categoria e idioma sempre vêm daqui. Os exemplos enviados à Meta
// são preenchidos pela administradora no momento do envio (ver `example`
// acima).
//
// Regra da Meta (api-reference.md, seção Templates): o texto de `body` NUNCA
// pode começar nem terminar com uma variável `{{n}}` -- precisa de texto
// estático nos dois lados. Por isso todo `body` abaixo termina com um `.`
// depois da última variável (o erro mais comum é justamente um link como
// última variável do corpo).
export const STANDARD_WHATSAPP_TEMPLATES: readonly StandardWhatsAppTemplate[] =
    [
        {
            key: "order_confirmed",
            name: WHATSAPP_TEMPLATE_NAMES.orderConfirmed,
            title: "Confirmação de pedido",
            description:
                "Confirma o pedido e leva a cliente para a página de detalhes.",
            category: "UTILITY",
            languageCode: "pt_BR",
            body: "Olá, {{1}}!\n\nSeu pedido nº {{2}}, no valor de {{3}}, foi confirmado.\n\nAcompanhe os detalhes em:\n{{4}}.",
            parameters: [
                {
                    key: "client_name",
                    label: "Nome da cliente",
                    example: "Maria",
                },
                {
                    key: "order_number",
                    label: "Número do pedido",
                    example: "1234",
                },
                {
                    key: "order_total",
                    label: "Valor do pedido",
                    example: "R$ 199,90",
                },
                {
                    key: "order_url",
                    label: "Link do pedido",
                    example: "https://loja.exemplo.com/pedidos/1234",
                },
            ],
        },
        {
            key: "payment_link",
            name: WHATSAPP_TEMPLATE_NAMES.paymentLink,
            title: "Link de pagamento",
            description:
                "Entrega à cliente o link seguro para pagamento do pedido.",
            category: "UTILITY",
            languageCode: "pt_BR",
            body: "Olá, {{1}}!\n\nSeu link de pagamento está pronto. Pague com segurança em:\n{{2}}.",
            parameters: [
                {
                    key: "client_name",
                    label: "Nome da cliente",
                    example: "Maria",
                },
                {
                    key: "payment_url",
                    label: "Link de pagamento",
                    example: "https://loja.exemplo.com/pagamento/exemplo",
                },
            ],
        },
    ] as const;

export function standardWhatsAppTemplate(
    key: WhatsAppTemplateKey,
): StandardWhatsAppTemplate {
    return STANDARD_WHATSAPP_TEMPLATES.find(
        (template) => template.key === key,
    )!;
}
