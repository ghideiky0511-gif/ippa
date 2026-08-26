import { z } from 'zod';
import {
  EntityIdSchema,
  IsoDateTimeSchema,
  MoneySchema,
  NonNegativeIntegerSchema,
  RequiredTextSchema,
} from './shared';

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

export const CatalogLastOrderInsightKindSchema = z.enum([
  'grade',
  'color',
  'category',
  'recency',
  'ticket',
  'mix',
]);
export type CatalogLastOrderInsightKind = z.infer<typeof CatalogLastOrderInsightKindSchema>;

export const CatalogLastOrderResumeOutputSchema = z.object({
  summary: RequiredTextSchema,
  insights: z.array(z.object({
    kind: CatalogLastOrderInsightKindSchema,
    title: RequiredTextSchema,
    evidence: RequiredTextSchema,
    action: RequiredTextSchema,
    isInterpretation: z.boolean(),
  }).strict()).max(3),
  sampleWarning: z.string().trim().min(1).nullable(),
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
