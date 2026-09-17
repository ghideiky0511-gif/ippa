import { z } from 'zod';
import {
  CartItemSchema,
  EntityIdSchema,
  IsoDateTimeSchema,
  MoneySchema,
  NonNegativeIntegerSchema,
  RequiredTextSchema,
} from './shared';
import { ProductPublicSchema } from './products';

export const AiExecutionSourceSchema = z.enum(['provider', 'cache']);
export type AiExecutionSource = z.infer<typeof AiExecutionSourceSchema>;

export const CatalogOrderBreakdownItemSchema = z.object({
  label: RequiredTextSchema,
  quantity: NonNegativeIntegerSchema,
  sharePercent: z.number().finite().min(0).max(100),
}).strict();
export type CatalogOrderBreakdownItem = z.infer<typeof CatalogOrderBreakdownItemSchema>;

export const CatalogOrderTicketComparisonSchema = z.object({
  averageValue: MoneySchema.nullable(),
  orderCount: NonNegativeIntegerSchema,
  differencePercent: z.number().finite().nullable(),
}).strict();
export type CatalogOrderTicketComparison = z.infer<typeof CatalogOrderTicketComparisonSchema>;

// Payload operacional enviado ao provider. Ele não contém IDs nem qualquer
// identificação pessoal; todos os números já vêm calculados pelo backend.
export const CatalogLastOrderResumeInputSchema = z.object({
  lastOrder: z.object({
    orderDate: IsoDateTimeSchema,
    totalValue: MoneySchema,
    totalPieces: NonNegativeIntegerSchema,
    distinctProducts: NonNegativeIntegerSchema,
    daysSincePurchase: NonNegativeIntegerSchema,
  }).strict(),
  tickets: z.object({
    windowMonths: z.literal(12),
    client: CatalogOrderTicketComparisonSchema,
    tenant: CatalogOrderTicketComparisonSchema,
  }).strict(),
  mix: z.object({
    categories: z.array(CatalogOrderBreakdownItemSchema),
    subcategories: z.array(CatalogOrderBreakdownItemSchema),
    colors: z.array(CatalogOrderBreakdownItemSchema),
    sizes: z.array(CatalogOrderBreakdownItemSchema),
    piecesWithoutCategory: NonNegativeIntegerSchema,
  }).strict(),
}).strict();
export type CatalogLastOrderResumeInput = z.infer<typeof CatalogLastOrderResumeInputSchema>;

export const CatalogLastOrderResumeOutputSchema = z.object({
  text: z.string().trim().min(1).max(600),
}).strict();
export type CatalogLastOrderResumeOutput = z.infer<typeof CatalogLastOrderResumeOutputSchema>;

export const CatalogLastOrderSummarySchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('no_history') }).strict(),
  z.object({
    status: z.literal('available'),
    facts: CatalogLastOrderResumeInputSchema,
    analysis: CatalogLastOrderResumeOutputSchema,
    executionId: EntityIdSchema,
    source: AiExecutionSourceSchema,
  }).strict(),
]);
export type CatalogLastOrderSummary = z.infer<typeof CatalogLastOrderSummarySchema>;

// Requisição da revisão do carrinho: o carrinho ainda não é um pedido
// persistido, então os itens vêm no corpo da requisição (mesmo padrão de
// `similar-products`/`orders`), não de um `sessionId`.
export const CartReviewRequestSchema = z.object({
  items: z.array(CartItemSchema),
}).strict();
export type CartReviewRequest = z.infer<typeof CartReviewRequestSchema>;

export const CartReviewMixSchema = z.object({
  categories: z.array(CatalogOrderBreakdownItemSchema),
  subcategories: z.array(CatalogOrderBreakdownItemSchema),
  colors: z.array(CatalogOrderBreakdownItemSchema),
  sizes: z.array(CatalogOrderBreakdownItemSchema),
  piecesWithoutCategory: NonNegativeIntegerSchema,
}).strict();
export type CartReviewMix = z.infer<typeof CartReviewMixSchema>;

// Fatos calculados pelo backend a partir do carrinho atual — usados tanto
// como resposta da rota simples (renderização da página, sem IA) quanto
// como input da ferramenta de IA. Sem IDs nem dado pessoal.
export const CartReviewFactsSchema = z.object({
  totalPieces: NonNegativeIntegerSchema,
  totalValue: MoneySchema,
  distinctProducts: NonNegativeIntegerSchema,
  mix: CartReviewMixSchema,
}).strict();
export type CartReviewFacts = z.infer<typeof CartReviewFactsSchema>;

export const CartReviewGroupSchema = z.object({
  category: RequiredTextSchema, // "Sem categoria" quando a peça não resolve nível 1
  itemKeys: z.array(EntityIdSchema),
}).strict();
export type CartReviewGroup = z.infer<typeof CartReviewGroupSchema>;

export const CartReviewSchema = z.object({
  facts: CartReviewFactsSchema,
  groups: z.array(CartReviewGroupSchema),
}).strict();
export type CartReview = z.infer<typeof CartReviewSchema>;

// `category`, quando presente, precisa repetir exatamente um dos rótulos de
// `mix.categories`/`mix.subcategories` recebidos como input — é a única
// âncora que o backend usa pra resolver peças de verdade do catálogo (ver
// cartReviewInsightService.ts). A IA nunca nomeia produto ou SKU.
export const CartReviewSuggestionSchema = z.object({
  title: RequiredTextSchema.max(80),
  evidence: RequiredTextSchema.max(160),
  action: RequiredTextSchema.max(160),
  category: RequiredTextSchema.max(80).optional(),
}).strict();
export type CartReviewSuggestion = z.infer<typeof CartReviewSuggestionSchema>;

// Saída bruta da ferramenta de IA — validada diretamente contra a resposta
// do provider. `headline` + `highlights` substituem um parágrafo único por
// tópicos curtos, mais fáceis de escanear na revisão do carrinho.
export const CartReviewInsightOutputSchema = z.object({
  headline: RequiredTextSchema.max(160),
  highlights: z.array(RequiredTextSchema.max(140)).max(5),
  suggestions: z.array(CartReviewSuggestionSchema).max(3),
}).strict();
export type CartReviewInsightOutput = z.infer<typeof CartReviewInsightOutputSchema>;

// Peças de verdade do catálogo anexadas pelo backend a cada sugestão, nunca
// produzidas pela IA — resolvidas deterministicamente a partir de
// `suggestion.category` (ver resolveSuggestedProducts em
// cartReviewInsightService.ts). Mesmo formato público já exposto por
// GET /api/[tenantSlug]/catalog.
export const CartReviewSuggestedProductSchema = ProductPublicSchema;
export type CartReviewSuggestedProduct = z.infer<typeof CartReviewSuggestedProductSchema>;

export const CartReviewInsightSuggestionSchema = CartReviewSuggestionSchema.extend({
  products: z.array(CartReviewSuggestedProductSchema),
}).strict();
export type CartReviewInsightSuggestion = z.infer<typeof CartReviewInsightSuggestionSchema>;

// Análise devolvida pela rota — a saída da IA enriquecida com os produtos
// reais resolvidos pelo backend.
export const CartReviewInsightAnalysisSchema = z.object({
  headline: RequiredTextSchema.max(160),
  highlights: z.array(RequiredTextSchema.max(140)).max(5),
  suggestions: z.array(CartReviewInsightSuggestionSchema).max(3),
}).strict();
export type CartReviewInsightAnalysis = z.infer<typeof CartReviewInsightAnalysisSchema>;

export const CartReviewInsightSummarySchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('empty_cart') }).strict(),
  z.object({
    status: z.literal('available'),
    facts: CartReviewFactsSchema,
    analysis: CartReviewInsightAnalysisSchema,
    executionId: EntityIdSchema,
    source: AiExecutionSourceSchema,
  }).strict(),
]);
export type CartReviewInsightSummary = z.infer<typeof CartReviewInsightSummarySchema>;
