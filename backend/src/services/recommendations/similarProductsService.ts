import { z } from "zod";
import type { Tenant } from "@/lib/db/tenant";
import type { Product, SimilarProductsRuleConfig, SimilarProductsSettings } from "@/lib/types";
import { listCatalog } from "@/services/catalog";
import { getSimilarProductsSettings } from "@/services/settings";
import { ValidationError } from "@/services/shared/errors";

type SimilarProductsContext = "quickview" | "cart";
type Rule = (catalog: Product[], anchors: Product[], excluded: Set<string>, settings: SimilarProductsSettings) => Product[];

const RULES: Record<string, Rule> = {
  sameSubcategory: (catalog, anchors, excluded) => catalog.filter((product) => !excluded.has(product.id) &&
    anchors.some((anchor) => Boolean(anchor.subcategory) && product.category === anchor.category &&
      product.subcategory === anchor.subcategory)),
  sameCategory: (catalog, anchors, excluded) => catalog.filter((product) => !excluded.has(product.id) &&
    anchors.some((anchor) => product.category === anchor.category)),
  complementaryCategory: (catalog, anchors, excluded, settings) => {
    const categories = new Set(anchors.flatMap((anchor) => settings.complementaryCategories[anchor.category] ?? []));
    return catalog.filter((product) => !excluded.has(product.id) && categories.has(product.category));
  },
};

function interleave(lists: Product[][]): Product[] {
  const result: Product[] = [];
  const seen = new Set<string>();
  const maximum = Math.max(0, ...lists.map((list) => list.length));
  for (let index = 0; index < maximum; index += 1) {
    for (const list of lists) {
      const product = list[index];
      if (product && !seen.has(product.id)) {
        seen.add(product.id);
        result.push(product);
      }
    }
  }
  return result;
}

// Último recurso para não deixar o bloco de recomendações vazio quando as
// regras configuradas não encontram nenhuma peça. A âncora nunca reaparece:
// no quick-view ela é o produto atual; no carrinho, são todos os produtos já
// escolhidos. Embaralhar uma cópia evita alterar a ordem do catálogo em cache.
function randomFallback(catalog: Product[], excluded: Set<string>, limit = 3): Product[] {
  const candidates = catalog.filter((product) => !excluded.has(product.id));
  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [candidates[index], candidates[randomIndex]] = [candidates[randomIndex], candidates[index]];
  }
  return candidates.slice(0, limit);
}

export function computeSimilarProducts(
  context: SimilarProductsContext,
  anchors: Product[],
  catalog: Product[],
  settings: SimilarProductsSettings,
): Product[] {
  const config: SimilarProductsRuleConfig = settings[context];
  const overrideField = context === "cart" ? "similarProductIdsCart" : "similarProductIdsQuickview";
  const anchorIds = new Set(anchors.map((anchor) => anchor.id));
  const byId = new Map(catalog.map((product) => [product.id, product]));
  const manuallyCurated = anchors.filter((anchor) => (anchor[overrideField]?.length ?? 0) > 0);
  const ruleBased = anchors.filter((anchor) => (anchor[overrideField]?.length ?? 0) === 0);
  const manual: Product[] = [];
  const manualIds = new Set<string>();
  for (const anchor of manuallyCurated) {
    for (const id of anchor[overrideField] ?? []) {
      const product = byId.get(id);
      if (!product || anchorIds.has(id) || manualIds.has(id)) continue;
      manualIds.add(id);
      manual.push(product);
    }
  }
  const excluded = new Set([...anchorIds, ...manualIds]);
  const candidates = ruleBased.length === 0 ? [] : interleave(config.rules
    .map((rule) => RULES[rule])
    .filter((rule): rule is Rule => Boolean(rule))
    .map((rule) => rule(catalog, ruleBased, excluded, settings)));
  const seen = new Set<string>();
  return [...manual, ...candidates].filter((product) => {
    if (seen.has(product.id)) return false;
    seen.add(product.id);
    return true;
  }).slice(0, config.limit);
}

const RecommendSimilarProductsSchema = z.object({
  context: z.enum(["quickview", "cart"]).optional(),
  productIds: z.array(z.string()).optional(),
});

export async function recommendSimilarProducts(
  tenant: Tenant,
  rawBody: unknown,
): Promise<{ products: Product[] }> {
  const parsed = RecommendSimilarProductsSchema.safeParse(rawBody);
  if (!parsed.success) throw new ValidationError("INVALID_INPUT", "Dados inválidos.", parsed.error.issues);
  const body = parsed.data;
  const context: SimilarProductsContext = body.context === "cart" ? "cart" : "quickview";
  const productIds = body.productIds ?? [];
  const [catalog, settings] = await Promise.all([listCatalog(tenant), getSimilarProductsSettings(tenant)]);
  const byId = new Map(catalog.map((product) => [product.id, product]));
  const anchors = productIds.map((id) => byId.get(id)).filter((product): product is Product => Boolean(product));
  const products = computeSimilarProducts(context, anchors, catalog, settings);
  return {
    products: products.length > 0 ? products : randomFallback(catalog, new Set(productIds)),
  };
}
