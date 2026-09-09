import { z } from "zod";

// Mesma resolução de domínio de emailNotificationService.ts
// (orderDetailsLink/orderPaymentLink) -- um único domínio público para toda
// a aplicação (multi-tenant por path, não por subdomínio), nunca por
// tenant. Usado para embutir o domínio como texto ESTÁTICO no body dos
// templates abaixo (ver motivo no comentário de STANDARD_WHATSAPP_TEMPLATES).
const PUBLIC_ORIGIN = (
    process.env.APP_URL ||
    process.env.ADMIN_ORIGIN ||
    "http://localhost:3015"
).replace(/\/+$/, "");

export const WhatsAppTemplateKeySchema = z.enum([
    "order_confirmed",
    "payment_link",
]);
export type WhatsAppTemplateKey = z.infer<typeof WhatsAppTemplateKeySchema>;

// _v2: a Meta não permite editar `components` de um template já submetido
// sob o mesmo nome+idioma (ver comentário abaixo sobre subcode 2388024) --
// bippa_order_confirmed_v1/bippa_payment_link_v1 já foram submetidos com o
// link como variável solta no BODY e precisam ficar como "mortos" na WABA;
// a correção (link em botão URL) vai como template novo.
export const WHATSAPP_TEMPLATE_NAMES = {
    orderConfirmed: "bippa_order_confirmed_v2",
    paymentLink: "bippa_payment_link_v2",
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
    // Botão dinâmico do link (ver motivo no comentário de
    // STANDARD_WHATSAPP_TEMPLATES abaixo) -- `urlTemplate` é o formato que a
    // Meta exige para um botão URL com variável: domínio ESTÁTICO seguido de
    // uma única `{{1}}` no final (só o caminho relativo é dinâmico).
    button?: { text: string; urlTemplate: string };
    // `example` aqui é só a SUGESTÃO pré-preenchida no formulário de envio
    // (WhatsAppIntegrationApp.tsx) -- a administradora confirma ou digita
    // outro valor no momento do envio, e é esse valor editado que vai para
    // a Meta (submitStandardWhatsAppTemplate exige um `examples[]` do
    // chamador, nunca usa este campo diretamente). Os placeholders de
    // "order_url"/"payment_url" abaixo (loja fictícia) só aparecem se este
    // catálogo for lido sem tenant; listStandardWhatsAppTemplates
    // (whatsappTemplateService.ts) os substitui pelo caminho real da loja
    // -- NUNCA com domínio (ver PUBLIC_ORIGIN acima: o domínio já está
    // embutido como texto estático na `url` do botão, não mais no `body`).
    // `component` diz para qual componente da Meta este exemplo vai --
    // whatsappTemplateService.ts usa isso para separar `bodyExamples` do
    // exemplo do botão ao montar o payload de criação do template.
    parameters: Array<{
        key: string;
        label: string;
        example: string;
        component: "body" | "button";
    }>;
}

// Catálogo fechado do MVP. O browser escolhe somente a chave lógica; nome,
// texto, categoria e idioma sempre vêm daqui. Os exemplos enviados à Meta
// são preenchidos pela administradora no momento do envio (ver `example`
// acima).
//
// Regra da Meta (api-reference.md, seção Templates; erro real observado em
// produção: 422 meta_graph_error / code=100 subcode=2388299 "Leading or
// trailing parameters not allowed"): o texto de `body` NUNCA pode começar
// nem terminar com uma variável `{{n}}` -- precisa de texto estático nos
// dois lados. Um único caractere de pontuação logo após a variável (ex.:
// só um `.`) NÃO é suficiente para a Meta considerar isso "texto estático"
// -- por isso todo `body` abaixo termina com uma frase de verdade (algumas
// palavras) depois da última variável, não só um ponto solto.
//
// Segunda regra da Meta, também confirmada em produção (422
// meta_graph_error / subcode 2388024): a Meta rejeita QUALQUER link no
// `body` cuja variável seja "colada" a um domínio estático (ex.:
// "http://localhost:3015/{{4}}") -- a tentativa anterior de manter o
// domínio como texto estático no `body` e só o caminho como variável
// (bippa_order_confirmed_v1/bippa_payment_link_v1) ainda caiu nessa regra,
// porque a Meta detecta o padrão de link mesmo com o domínio fora da
// variável. Único formato aceito para link dinâmico: componente `BUTTONS`
// dedicado, `type: "URL"`, com a URL base ESTÁTICA e só o sufixo como
// `{{1}}` (numeração própria do botão, reinicia em 1 independente do
// `body`) -- por isso os templates abaixo não têm mais link nenhum no
// `body`, só no `button.urlTemplate`. whatsappTemplateService.ts monta o
// componente `BUTTONS` a partir dele ao criar o template
// (bippaMessagingClient.createWabaTemplate), e
// whatsappNotificationService.ts extrai o caminho de
// orderDetailsLink()/orderPaymentLink() para preencher o `{{1}}` do botão
// no envio (bippaMessagingClient.dispatchTemplateWithUrlButton) -- ver
// api-reference.md, seção "Envio de mensagens", sobre o `payload.template`
// bruto usado para preencher parâmetro de botão (sem rota dedicada como
// Order Details/Payment Request).
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
            body: `Olá, {{1}}!\n\nSeu pedido nº {{2}}, no valor de {{3}}, foi confirmado. Acompanhe os detalhes no botão abaixo. Obrigada pela preferência!`,
            button: {
                text: "Ver pedido",
                urlTemplate: `${PUBLIC_ORIGIN}/{{1}}`,
            },
            parameters: [
                {
                    key: "client_name",
                    label: "Nome da cliente",
                    example: "Maria",
                    component: "body",
                },
                {
                    key: "order_number",
                    label: "Número do pedido",
                    example: "1234",
                    component: "body",
                },
                {
                    key: "order_total",
                    label: "Valor do pedido",
                    example: "R$ 199,90",
                    component: "body",
                },
                {
                    key: "order_url",
                    label: "Caminho do pedido (sem domínio)",
                    example: "loja-exemplo/pedidos/1234",
                    component: "button",
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
            body: `Olá, {{1}}!\n\nSeu link de pagamento está pronto. Pague com segurança pelo botão abaixo. Obrigada pela preferência!`,
            button: {
                text: "Pagar agora",
                urlTemplate: `${PUBLIC_ORIGIN}/{{1}}`,
            },
            parameters: [
                {
                    key: "client_name",
                    label: "Nome da cliente",
                    example: "Maria",
                    component: "body",
                },
                {
                    key: "payment_url",
                    label: "Caminho do link de pagamento (sem domínio)",
                    example: "loja-exemplo/pagar/exemplo",
                    component: "button",
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
