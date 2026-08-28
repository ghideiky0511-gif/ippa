import { z } from 'zod';

export const EntityIdSchema = z.string().trim().min(1, 'Identificador obrigatório.');

export const RequiredTextSchema = z.string().trim().min(1, 'Campo obrigatório.');

// Campos opcionais enviados por formulários HTML chegam como string vazia.
// Normalizá-los aqui evita que cada serviço repita trim + fallback.
export const OptionalTextSchema = z.preprocess(
  (value) => typeof value === 'string' && !value.trim() ? undefined : value,
  z.string().trim().min(1, 'Campo inválido.').optional(),
);

export const MoneySchema = z.number().finite().nonnegative('O valor não pode ser negativo.');
export const PositiveIntegerSchema = z.number().int().positive('Informe um número inteiro positivo.');
export const NonNegativeIntegerSchema = z.number().int().nonnegative('Informe um número inteiro não negativo.');
export const IsoDateTimeSchema = z.iso.datetime();

// Estoque disponível de uma variante (on_hand - reserved). Ao contrário de
// uma quantidade pedida, esse valor pode vir negativo do ERP (erro de
// estoque do lado dele — venda além do saldo, ajuste incorreto etc.) e
// isso precisa passar pela validação em vez de ser rejeitado, senão a
// resposta da API quebra pra qualquer produto com esse problema.
export const StockQtySchema = z.number().int();

// Valor normalizado e reutilizável para todos os e-mails que entram no
// domínio. A transformação garante que comparações e índices de unicidade
// trabalhem sempre com o mesmo formato.
export const EmailSchema = z.string()
  .trim()
  .toLowerCase()
  .email('Informe um e-mail válido.');

// Formulários HTML enviam string vazia para campos opcionais. Convertemos
// esse caso para undefined antes de validar o e-mail, sem aceitar texto
// inválido quando o campo foi de fato preenchido.
export const OptionalEmailSchema = z.preprocess(
  (value) => typeof value === 'string' && !value.trim() ? undefined : value,
  EmailSchema.optional(),
);

export function documentDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export const CpfCnpjSchema = z.string()
  .transform(documentDigits)
  .refine((value) => value.length === 11 || value.length === 14, {
    message: 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.',
  });

export const OptionalCpfCnpjSchema = z.preprocess(
  (value) => typeof value === 'string' && !value.trim() ? undefined : value,
  CpfCnpjSchema.optional(),
);

export type DocumentType = 'cpf' | 'cnpj' | null;

export function getDocumentType(cpfCnpj: string): DocumentType {
  const digits = documentDigits(cpfCnpj);
  if (digits.length === 11) return 'cpf';
  if (digits.length === 14) return 'cnpj';
  return null;
}

export const CepSchema = z.string()
  .transform(documentDigits)
  .refine((value) => value.length === 8, { message: 'Informe um CEP com 8 dígitos.' });

export const OptionalCepSchema = z.preprocess(
  (value) => typeof value === 'string' && !value.trim() ? undefined : value,
  CepSchema.optional(),
);

export const HttpUrlSchema = z.string().url('Informe uma URL válida.').refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === 'http:' || protocol === 'https:';
}, 'Informe uma URL HTTP ou HTTPS válida.');

export const CartItemSchema = z.object({
  key: EntityIdSchema,
  id: EntityIdSchema,
  name: RequiredTextSchema,
  image: z.string().optional(),
  color: z.string().optional(),
  size: z.string().optional(),
  price: MoneySchema,
  qty: NonNegativeIntegerSchema,
  // Snapshot do estoque da variante no momento em que foi adicionada ao
  // carrinho (não recalcula depois — se o estoque mudar, a peça já
  // escolhida não deve "sumir" a previsão combinada). Sem valor = sem
  // controle de estoque, qty inteira é "pronta entrega" (hoje).
  stockQty: StockQtySchema.optional(),
  // Previsão de entrega escolhida pra a parte da qty que excede stockQty
  // (rótulo livre, ex. "Em 30 dias" — vem de CONFIG.backorderDeliveryOptions,
  // que é por loja). Sem valor = ainda não escolhida. Rótulo livre, não é
  // data — não usa z.iso.datetime() de propósito.
  backorderDate: z.string().optional(),
  // Marcado quando a vendedora dá duplo-clique no "+" do card pra
  // destacar a peça como sugestão dela pra cliente (fundo amarelo no
  // botão) — ver ProductCard.tsx. Ausente/false = peça só selecionada,
  // sem curadoria da vendedora.
  suggested: z.boolean().optional(),
});
export type CartItem = z.infer<typeof CartItemSchema>;

export const FreightProviderKindSchema = z.enum(['pickup', 'fixed', 'carrier']);
export type FreightProviderKind = z.infer<typeof FreightProviderKindSchema>;

export const DeliveryFulfillmentModeSchema = z.enum(['pickup', 'address_delivery']);
export type DeliveryFulfillmentMode = z.infer<typeof DeliveryFulfillmentModeSchema>;

export const DeliveryProviderKindSchema = z.enum(['internal', 'external']);
export type DeliveryProviderKind = z.infer<typeof DeliveryProviderKindSchema>;

export const DeliveryPricingModeSchema = z.enum(['fixed', 'external_quote']);
export type DeliveryPricingMode = z.infer<typeof DeliveryPricingModeSchema>;

export const DeliveryProviderSchema = z.object({
  id: EntityIdSchema,
  code: RequiredTextSchema,
  kind: DeliveryProviderKindSchema,
  name: RequiredTextSchema,
  companyId: EntityIdSchema.nullable(),
  active: z.boolean(),
});
export type DeliveryProvider = z.infer<typeof DeliveryProviderSchema>;

export const DeliveryOfferingSchema = z.object({
  id: EntityIdSchema,
  deliveryTypeId: EntityIdSchema,
  provider: DeliveryProviderSchema,
  pricingMode: DeliveryPricingModeSchema,
  fixedPrice: MoneySchema.nullable(),
  etaLabel: z.string().nullable(),
  active: z.boolean(),
});
export type DeliveryOffering = z.infer<typeof DeliveryOfferingSchema>;

export const DeliveryTypeSchema = z.object({
  id: EntityIdSchema,
  code: z.enum(['pickup', 'address_delivery']),
  fulfillmentMode: DeliveryFulfillmentModeSchema,
  name: RequiredTextSchema,
  active: z.boolean(),
  sortOrder: z.number().int(),
  offering: DeliveryOfferingSchema,
});
export type DeliveryType = z.infer<typeof DeliveryTypeSchema>;

export const UpdateDeliveryTypeInputSchema = z.object({
  name: RequiredTextSchema.optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  fixedPrice: MoneySchema.optional(),
  etaLabel: z.union([z.string().trim().min(1), z.null()]).optional(),
}).refine((value) => Object.keys(value).length > 0, 'Informe ao menos uma alteração.');
export type UpdateDeliveryTypeInput = z.infer<typeof UpdateDeliveryTypeInputSchema>;

export const DeliveryQuoteSchema = z.object({
  id: EntityIdSchema,
  quoteId: EntityIdSchema.nullable(),
  deliveryTypeId: EntityIdSchema,
  deliveryOfferingId: EntityIdSchema,
  providerId: EntityIdSchema,
  fulfillmentMode: DeliveryFulfillmentModeSchema,
  deliveryTypeName: RequiredTextSchema,
  providerName: RequiredTextSchema,
  destinationCep: z.string().nullable(),
  label: RequiredTextSchema,
  price: MoneySchema,
  etaLabel: z.string().nullable(),
  // Alias temporário para consumidores do contrato anterior.
  kind: FreightProviderKindSchema,
});
export type DeliveryQuote = z.infer<typeof DeliveryQuoteSchema>;

export const OrderFreightStatusSchema = z.enum([
  'aguardando', 'etiqueta_emitida', 'em_transporte', 'entregue', 'devolvido', 'cancelado',
]);
export type OrderFreightStatus = z.infer<typeof OrderFreightStatusSchema>;

// Tipo de frete escolhido operacionalmente pra este pedido -- granularidade
// maior que FreightProviderKindSchema (pickup/fixed/carrier), editável depois
// do pedido fechado enquanto o frete ainda não foi despachado (ver
// updateOrderFreightMethod em orderService.ts).
export const OrderFreightMethodSchema = z.enum([
  'transportadora', 'correios', 'excursao', 'loja_vizinha', 'retirada_local', 'motoboy', 'entrega_propria',
]);
export type OrderFreightMethod = z.infer<typeof OrderFreightMethodSchema>;

// O que a tela de frete lista pra escolher (uma linha por `freight_providers`
// ativo do tenant no momento em que a sessão pediu cotação).
export const FreightQuoteSchema = DeliveryQuoteSchema;
export type FreightQuote = z.infer<typeof FreightQuoteSchema>;

// Snapshot do frete escolhido, guardado em `order_sessions` (6 colunas) e
// exposto na API como um objeto só pra não espalhar 6 campos soltos.
export const SessionFreightSchema = z.object({
  quoteId: EntityIdSchema.nullable(),
  providerId: EntityIdSchema.nullable(),
  deliveryTypeId: EntityIdSchema.nullable(),
  deliveryOfferingId: EntityIdSchema.nullable(),
  fulfillmentMode: DeliveryFulfillmentModeSchema.nullable(),
  deliveryTypeName: z.string().nullable(),
  providerName: z.string().nullable(),
  destinationCep: z.string().nullable(),
  kind: FreightProviderKindSchema,
  label: RequiredTextSchema,
  price: MoneySchema,
  etaLabel: z.string().nullable(),
});
export type SessionFreight = z.infer<typeof SessionFreightSchema>;

// Snapshot final do frete no pedido (`order_freights`), com o estado de
// rastreio -- ver order_freight_status.
export const OrderFreightSchema = z.object({
  id: EntityIdSchema,
  providerId: EntityIdSchema.nullable(),
  quoteId: EntityIdSchema.nullable(),
  deliveryTypeId: EntityIdSchema.nullable(),
  deliveryOfferingId: EntityIdSchema.nullable(),
  fulfillmentMode: DeliveryFulfillmentModeSchema.nullable(),
  deliveryTypeName: z.string().nullable(),
  providerName: z.string().nullable(),
  destinationCep: z.string().nullable(),
  kind: FreightProviderKindSchema,
  method: OrderFreightMethodSchema.nullable(),
  label: RequiredTextSchema,
  price: MoneySchema,
  etaLabel: z.string().nullable(),
  trackingCode: z.string().nullable(),
  trackingUrl: z.string().nullable(),
  status: OrderFreightStatusSchema,
  shippedAt: IsoDateTimeSchema.nullable(),
  deliveredAt: IsoDateTimeSchema.nullable(),
  cancelledAt: IsoDateTimeSchema.nullable(),
});
export type OrderFreight = z.infer<typeof OrderFreightSchema>;
