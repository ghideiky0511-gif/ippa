import { z } from "zod";
import { ClientSchema } from "./clients";
import { CommercialGroupSchema } from "./commercialGroups";
import { EntityIdSchema, IsoDateTimeSchema, RequiredTextSchema } from "./shared";

// Contratos da aba Conversas do CRM (backend/src/services/crm/). O conteúdo
// de conversa/mensagem em si continua vivendo só no bippa-messaging (ver
// backend/docs/mensageria/bippa-messaging/docs/api-reference.md, seção
// "Inbox / Conversas") -- estes schemas descrevem a vista já enriquecida
// que o Catálogo devolve pro frontend (cliente/grupo comercial vinculados,
// escopo por vendedora já resolvido).

export const CrmInboxSchema = z.object({
    phoneId: RequiredTextSchema,
    sellerId: EntityIdSchema,
    sellerName: RequiredTextSchema,
    displayPhoneMasked: z.string().nullable(),
    verifiedName: z.string().nullable(),
});
export type CrmInbox = z.infer<typeof CrmInboxSchema>;

// Espelha BippaPage (bippaMessagingClient.ts), sem cursorField -- o
// frontend nunca precisa saber por qual coluna a página upstream foi
// ordenada, só repassar next_cursor de volta.
export const CrmPageInfoSchema = z.object({
    limit: z.number().int(),
    hasMore: z.boolean(),
    nextCursor: z.string().nullable(),
});
export type CrmPageInfo = z.infer<typeof CrmPageInfoSchema>;

export const CrmConversationStatusSchema = z.enum(["open", "closed"]);
export type CrmConversationStatus = z.infer<typeof CrmConversationStatusSchema>;

export const CrmLinkSourceSchema = z.enum(["auto", "manual"]);
export type CrmLinkSource = z.infer<typeof CrmLinkSourceSchema>;

export const CrmConversationSchema = z.object({
    id: RequiredTextSchema,
    status: CrmConversationStatusSchema,
    phoneNumber: z.string().nullable(),
    contactName: z.string().nullable(),
    preview: z.string().nullable(),
    lastInboundAt: IsoDateTimeSchema.nullable(),
    updatedAt: IsoDateTimeSchema,
    // Inbox (WABA/vendedora) dona da conversa -- já resolvido e validado
    // contra resolveVisibleInboxes no backend, nunca calculado no frontend.
    sellerId: EntityIdSchema,
    sellerName: RequiredTextSchema,
    // Cliente/grupo comercial do catálogo já vinculados nativamente (ver
    // whatsapp_contact_links) -- null quando o auto-match não resolveu e
    // ninguém vinculou manualmente ainda.
    client: ClientSchema.nullable(),
    commercialGroup: CommercialGroupSchema.nullable(),
    linkSource: CrmLinkSourceSchema.nullable(),
    // Presente só quando o auto-match encontrou mais de um cliente com o
    // mesmo whatsapp_phone (matriz/filial) -- a UI oferece estas opções em
    // vez de adivinhar.
    linkCandidates: z.array(ClientSchema).optional(),
});
export type CrmConversation = z.infer<typeof CrmConversationSchema>;

export const CrmConversationsPageSchema = z.object({
    data: z.array(CrmConversationSchema),
    page: CrmPageInfoSchema,
});
export type CrmConversationsPage = z.infer<typeof CrmConversationsPageSchema>;

export const CrmMessageDirectionSchema = z.enum(["inbound", "outbound"]);
export type CrmMessageDirection = z.infer<typeof CrmMessageDirectionSchema>;

export const CrmMessageSchema = z.object({
    id: RequiredTextSchema,
    conversationId: RequiredTextSchema,
    direction: CrmMessageDirectionSchema,
    type: RequiredTextSchema,
    providerMessageId: z.string().nullable(),
    body: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    occurredAt: IsoDateTimeSchema,
    // true quando body veio vazio com metadata.retained=true (conteúdo
    // purgado após 90 dias, ver chat-backend-integration.md) -- a UI deve
    // mostrar "conteúdo não disponível", nunca uma bolha vazia como se a
    // pessoa tivesse mandado nada.
    contentPurged: z.boolean(),
});
export type CrmMessage = z.infer<typeof CrmMessageSchema>;

export const CrmMessagesPageSchema = z.object({
    data: z.array(CrmMessageSchema),
    page: CrmPageInfoSchema,
});
export type CrmMessagesPage = z.infer<typeof CrmMessagesPageSchema>;

export const CrmServiceWindowSchema = z.object({
    withinWindow: z.boolean(),
    lastInboundAt: IsoDateTimeSchema.nullable(),
    expiresAt: IsoDateTimeSchema.nullable(),
});
export type CrmServiceWindow = z.infer<typeof CrmServiceWindowSchema>;

export const SendCrmTextInputSchema = z.object({
    text: RequiredTextSchema.max(4096, "Mensagem muito longa (máximo de 4096 caracteres)."),
});
export type SendCrmTextInput = z.infer<typeof SendCrmTextInputSchema>;

// Mesmas duas chaves de WhatsAppTemplateKeySchema
// (services/whatsapp/whatsappTemplates.ts) -- duplicado aqui de propósito:
// contracts/ é compartilhado com o frontend via sync-contracts.mjs e não
// pode importar de services/. Se um template novo for adicionado lá, esta
// lista precisa acompanhar.
export const CrmTemplateKeySchema = z.enum(["order_confirmed", "payment_link"]);
export type CrmTemplateKey = z.infer<typeof CrmTemplateKeySchema>;

export const SendCrmTemplateInputSchema = z.object({
    templateKey: CrmTemplateKeySchema,
    // Chaves SEMÂNTICAS (StandardWhatsAppTemplate.parameters[].key, ex.:
    // "client_name"), não posição numérica -- o backend resolve a ordem e
    // separa body/botão a partir da definição canônica do template
    // (services/whatsapp/whatsappTemplates.ts), nunca confia numa ordem
    // vinda do navegador.
    params: z.record(z.string(), RequiredTextSchema),
    // Sufixo do botão de link (ex.: "pedidos/1234"), NUNCA a URL completa
    // -- o domínio já é texto estático no template (ver PUBLIC_ORIGIN em
    // whatsappTemplates.ts). Obrigatório só quando o template escolhido tem
    // um componente de botão (ambos os cadastrados hoje têm) -- o backend
    // valida isso contra a definição real do template, não contra um flag
    // enviado pelo navegador.
    buttonParam: z.string().trim().min(1).max(2048).optional(),
});
export type SendCrmTemplateInput = z.infer<typeof SendCrmTemplateInputSchema>;

export const SendCrmMessageResultSchema = z.object({
    attemptId: EntityIdSchema,
    status: z.enum(["queued", "sent", "failed"]),
    dispatchId: z.string().nullable(),
});
export type SendCrmMessageResult = z.infer<typeof SendCrmMessageResultSchema>;

export const LinkCrmConversationClientInputSchema = z.object({
    clientId: EntityIdSchema.nullable(),
});
export type LinkCrmConversationClientInput = z.infer<typeof LinkCrmConversationClientInputSchema>;
