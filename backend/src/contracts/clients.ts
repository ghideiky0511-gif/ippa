import { z } from "zod";
import {
    EntityIdSchema,
    IsoDateTimeSchema,
    OptionalCepSchema,
    OptionalCpfCnpjSchema,
    OptionalEmailSchema,
    OptionalTextSchema,
    OptionalWhatsAppPhoneSchema,
    RequiredTextSchema,
} from "./shared";

// Cadastro de cliente — separado de AuthUser de propósito: uma cliente pode
// existir aqui (criada pela vendedora, presencial/WhatsApp) sem nunca ter
// feito login. Quando ela um dia entrar sozinha, o login referencia esse
// registro por `clientId`. `lastSellerId` é a última vendedora que a
// atendeu — usado na regra de "cai pra quem atendeu da última vez" quando
// ela volta a montar carrinho sozinha (ver backend/src/services/orders
// assignment). "Completo" pra poder fechar um pedido (fluxo de frete) =
// name + cpfCnpj + email + cep preenchidos — ver isClientComplete em
// frontend/src/lib/clientComplete.ts.
// Perfil comercial persistido da cliente. É separado das credenciais: uma
// cliente pode existir sem ter uma conta de acesso, e uma conta tem e-mail de
// login próprio. Os comandos abaixo reaproveitam o mesmo perfil sem aceitar
// os campos de saída (id, carrinho, datas) por engano.
export const ClientProfileSchema = z.object({
    name: RequiredTextSchema,
    cpfCnpj: z.string().optional(),
    email: OptionalEmailSchema,
    // WhatsApp para notificação de pedido (ver services/whatsapp) — opcional
    // como o resto do cadastro, nunca bloqueia o fluxo de quem preenche.
    whatsappPhone: z.string().optional(),
    cep: z.string().optional(),
    // Endereço completo — opcional aqui (cadastro parcial da vendedora no
    // talão pode não ter isso), mas obrigatório no autocadastro da cliente
    // final. isClientComplete não exige esses campos — o gate do talão
    // continua só nome+CPF/CNPJ+email+CEP.
    street: z.string().optional(),
    number: z.string().optional(),
    complement: z.string().optional(),
    neighborhood: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    // Opcionais, mostrados condicionalmente no cadastro conforme o
    // documento digitado (nunca os dois ao mesmo tempo): CNPJ (14 dígitos)
    // pergunta quem é o responsável pela empresa; CPF (11 dígitos) pergunta
    // o nome da loja da cliente (revendedora informal). Nunca bloqueiam o
    // cadastro — a pessoa segue sem preencher se quiser.
    companyResponsible: z.string().optional(),
    storeName: z.string().optional(),
});
export type ClientProfile = z.infer<typeof ClientProfileSchema>;

export const ClientProfileInputSchema = z.object({
    name: RequiredTextSchema,
    cpfCnpj: OptionalCpfCnpjSchema,
    email: OptionalEmailSchema,
    whatsappPhone: OptionalWhatsAppPhoneSchema,
    cep: OptionalCepSchema,
    street: OptionalTextSchema,
    number: OptionalTextSchema,
    complement: OptionalTextSchema,
    neighborhood: OptionalTextSchema,
    city: OptionalTextSchema,
    state: OptionalTextSchema,
    companyResponsible: OptionalTextSchema,
    storeName: OptionalTextSchema,
});
export type ClientProfileInput = z.infer<typeof ClientProfileInputSchema>;

export const CreateClientInputSchema = ClientProfileInputSchema.pick({
    name: true,
    cpfCnpj: true,
});
export type CreateClientInput = z.infer<typeof CreateClientInputSchema>;

export const UpdateClientInputSchema = ClientProfileInputSchema.partial();
export type UpdateClientInput = z.infer<typeof UpdateClientInputSchema>;

export const ClientSchema = ClientProfileSchema.extend({
    id: EntityIdSchema,
    lastSellerId: EntityIdSchema.optional(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
});
export type Client = z.infer<typeof ClientSchema>;

export const ClientWithLoginSchema = ClientSchema.extend({
    hasLogin: z.boolean(),
});
export type ClientWithLogin = z.infer<typeof ClientWithLoginSchema>;

export const PaginationSchema = z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().positive(),
});
export type Pagination = z.infer<typeof PaginationSchema>;

export const ClientKpisSchema = z.object({
    newThisMonth: z.number().int().nonnegative(),
    withEmail: z.number().int().nonnegative(),
    withAddress: z.number().int().nonnegative(),
});
export type ClientKpis = z.infer<typeof ClientKpisSchema>;

export const ClientsPageSchema = z.object({
    clients: z.array(ClientSchema),
    pagination: PaginationSchema,
    kpis: ClientKpisSchema,
});
export type ClientsPage = z.infer<typeof ClientsPageSchema>;

export const ClientLookupSourceSchema = z.enum(['local', 'erp', 'not_found']);
export type ClientLookupSource = z.infer<typeof ClientLookupSourceSchema>;

export const ClientLookupResultSchema = z.object({
    client: ClientSchema.nullable(),
    source: ClientLookupSourceSchema,
});
export type ClientLookupResult = z.infer<typeof ClientLookupResultSchema>;

export const ClientSyncResultSchema = z.object({
    client: ClientSchema,
    updatedFields: z.array(z.string()),
});
export type ClientSyncResult = z.infer<typeof ClientSyncResultSchema>;
