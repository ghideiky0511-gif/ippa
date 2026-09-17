import type { CartItem } from '@/contracts/shared';
import type {
  CartReview,
  CartReviewFacts,
  CartReviewInsightAnalysis,
  CartReviewInsightOutput,
  CartReviewInsightSuggestion,
  CartReviewInsightSummary,
  CartReviewRequest,
  CartReviewSuggestedProduct,
  CatalogOrderBreakdownItem,
} from '@/contracts/ai';
import { CartReviewRequestSchema } from '@/contracts/ai';
import type { Tenant } from '@/lib/db/tenant';
import type { AuthUser, Product, Variant } from '@/lib/types';
import { listCatalog } from '@/services/catalog';
import { ForbiddenError, ValidationError } from '@/services/shared/errors';
import { runAiTool } from './aiToolEngine';
import { cartReviewInsightTool } from './cartReviewInsightTool';
import type { AiToolRunResult } from './types';

// Quantas peças reais do catálogo anexar por sugestão — o suficiente pra
// dar opções sem virar uma segunda vitrine dentro do card de IA.
const MAX_SUGGESTED_PRODUCTS_PER_SUGGESTION = 2;

interface ResolvedLine {
  key: string;
  qty: number;
  unitPrice: number;
  productId: string;
  category: string | null;
  subcategory: string | null;
  color: string | null;
  size: string | null;
}

function normalizedLabel(value: string | null): string | null {
  const label = value?.trim();
  return label ? label : null;
}

function rounded(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function classificationLabel(variant: Variant | undefined, level: 1 | 2 | 3): string | null {
  const match = variant?.classifications.find((classification) => classification.type.categoryLevel === level);
  return normalizedLabel(match?.name ?? null);
}

function resolveVariant(product: Product | undefined, item: CartItem): Variant | undefined {
  if (!product) return undefined;
  return (
    product.variants.find((variant) => variant.color === item.color && variant.size === item.size)
    ?? (product.variants.length === 1 ? product.variants[0] : undefined)
  );
}

function resolveLines(items: CartItem[], catalog: Product[]): ResolvedLine[] {
  const byId = new Map(catalog.map((product) => [product.id, product]));
  return items
    .filter((item) => item.qty > 0)
    .map((item) => {
      const product = byId.get(item.id);
      const variant = resolveVariant(product, item);
      return {
        key: item.key,
        qty: item.qty,
        unitPrice: item.price,
        productId: item.id,
        category: classificationLabel(variant, 1),
        subcategory:
          classificationLabel(variant, 3)
          ?? classificationLabel(variant, 2)
          ?? classificationLabel(variant, 1),
        color: normalizedLabel(item.color ?? null),
        size: normalizedLabel(item.size ?? null),
      };
    });
}

function breakdown(
  lines: ResolvedLine[],
  pick: (line: ResolvedLine) => string | null,
  totalPieces: number,
): CatalogOrderBreakdownItem[] {
  const quantities = new Map<string, number>();
  for (const line of lines) {
    const label = pick(line);
    if (!label) continue;
    quantities.set(label, (quantities.get(label) ?? 0) + line.qty);
  }
  return [...quantities.entries()]
    .map(([label, quantity]) => ({
      label,
      quantity,
      sharePercent: totalPieces === 0 ? 0 : rounded((quantity / totalPieces) * 100, 1),
    }))
    .sort((left, right) => right.quantity - left.quantity || left.label.localeCompare(right.label, 'pt-BR'));
}

export function buildCartReview(items: CartItem[], catalog: Product[]): CartReview {
  const lines = resolveLines(items, catalog);
  const totalPieces = lines.reduce((sum, line) => sum + line.qty, 0);

  const facts: CartReviewFacts = {
    totalPieces,
    totalValue: rounded(lines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0)),
    distinctProducts: new Set(lines.map((line) => line.productId)).size,
    mix: {
      categories: breakdown(lines, (line) => line.category, totalPieces),
      subcategories: breakdown(lines, (line) => line.subcategory, totalPieces),
      colors: breakdown(lines, (line) => line.color, totalPieces),
      sizes: breakdown(lines, (line) => line.size, totalPieces),
      piecesWithoutCategory: lines.reduce((sum, line) => sum + (line.category ? 0 : line.qty), 0),
    },
  };

  const groupsByCategory = new Map<string, string[]>();
  for (const line of lines) {
    const label = line.category ?? 'Sem categoria';
    groupsByCategory.set(label, [...(groupsByCategory.get(label) ?? []), line.key]);
  }

  return {
    facts,
    groups: [...groupsByCategory.entries()].map(([category, itemKeys]) => ({ category, itemKeys })),
  };
}

function toSuggestedProduct(product: Product): CartReviewSuggestedProduct {
  const {
    relatedProductIds: _relatedProductIds,
    similarProductIdsQuickview: _similarProductIdsQuickview,
    similarProductIdsCart: _similarProductIdsCart,
    markup: _markup,
    ...publicProduct
  } = product;
  return publicProduct;
}

function productMatchesCategory(product: Product, normalizedCategory: string): boolean {
  return product.variants.some((variant) =>
    variant.classifications.some((classification) => {
      const label = normalizedLabel(classification.name);
      return label !== null && label.toLocaleUpperCase('pt-BR') === normalizedCategory;
    }));
}

// Âncora determinística entre a sugestão da IA e o catálogo real: a IA só
// aponta um rótulo de categoria já recebido no mix (nunca um produto), e o
// backend resolve peças de verdade a partir dele — sem categoria
// reconhecida, a sugestão simplesmente não ganha peças anexadas.
function resolveSuggestedProducts(
  category: string | undefined,
  catalog: Product[],
  cartProductIds: Set<string>,
): CartReviewSuggestedProduct[] {
  const normalizedCategory = normalizedLabel(category ?? null)?.toLocaleUpperCase('pt-BR');
  if (!normalizedCategory) return [];

  return catalog
    .filter((product) => !cartProductIds.has(product.id))
    .filter((product) => product.variants.some((variant) => variant.availability === 'in_stock'))
    .filter((product) => productMatchesCategory(product, normalizedCategory))
    .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'))
    .slice(0, MAX_SUGGESTED_PRODUCTS_PER_SUGGESTION)
    .map(toSuggestedProduct);
}

function buildCartReviewInsightAnalysis(
  output: CartReviewInsightOutput,
  catalog: Product[],
  cartProductIds: Set<string>,
): CartReviewInsightAnalysis {
  const suggestions: CartReviewInsightSuggestion[] = output.suggestions.map((suggestion) => ({
    ...suggestion,
    products: resolveSuggestedProducts(suggestion.category, catalog, cartProductIds),
  }));
  return { headline: output.headline, highlights: output.highlights, suggestions };
}

export function canRunCartReviewInsight(user: AuthUser): boolean {
  if (user.role === 'cliente' || user.role === 'vendedora') return true;
  return user.role === 'administrador' && user.permissions?.adminAccess === true;
}

function parseCartReviewRequest(rawBody: unknown): CartReviewRequest {
  const parsed = CartReviewRequestSchema.safeParse(rawBody);
  if (!parsed.success) throw new ValidationError('INVALID_INPUT', 'Dados inválidos.', parsed.error.issues);
  return parsed.data;
}

export interface CartReviewInsightDependencies {
  readCatalog: (tenant: Tenant) => Promise<Product[]>;
  runTool: (
    tenant: Tenant,
    actor: { userId: string; role: string },
    input: CartReviewFacts,
  ) => Promise<AiToolRunResult<CartReviewInsightOutput>>;
}

export function createCartReviewInsightService(
  overrides: Partial<CartReviewInsightDependencies> = {},
) {
  const dependencies: CartReviewInsightDependencies = {
    readCatalog: overrides.readCatalog ?? listCatalog,
    runTool: overrides.runTool ?? ((tenant, actor, input) =>
      runAiTool(tenant, actor, cartReviewInsightTool, input)),
  };

  return async function cartReviewInsight(
    tenant: Tenant,
    user: AuthUser,
    rawBody: unknown,
  ): Promise<CartReviewInsightSummary> {
    if (!canRunCartReviewInsight(user)) throw new ForbiddenError();
    const { items } = parseCartReviewRequest(rawBody);

    // A leitura do catálogo termina antes de qualquer chamada à IA.
    const catalog = await dependencies.readCatalog(tenant);
    const { facts } = buildCartReview(items, catalog);
    if (facts.totalPieces === 0) return { status: 'empty_cart' };

    const execution = await dependencies.runTool(tenant, { userId: user.id, role: user.role }, facts);
    const cartProductIds = new Set(items.filter((item) => item.qty > 0).map((item) => item.id));
    return {
      status: 'available',
      facts,
      analysis: buildCartReviewInsightAnalysis(execution.data, catalog, cartProductIds),
      executionId: execution.executionId,
      source: execution.source,
    };
  };
}

export const cartReviewInsight = createCartReviewInsightService();

export interface CartReviewDependencies {
  readCatalog: (tenant: Tenant) => Promise<Product[]>;
}

export function createCartReviewService(overrides: Partial<CartReviewDependencies> = {}) {
  const dependencies: CartReviewDependencies = {
    readCatalog: overrides.readCatalog ?? listCatalog,
  };

  return async function cartReview(
    tenant: Tenant,
    user: AuthUser,
    rawBody: unknown,
  ): Promise<CartReview> {
    if (!canRunCartReviewInsight(user)) throw new ForbiddenError();
    const { items } = parseCartReviewRequest(rawBody);
    const catalog = await dependencies.readCatalog(tenant);
    return buildCartReview(items, catalog);
  };
}

export const cartReview = createCartReviewService();
