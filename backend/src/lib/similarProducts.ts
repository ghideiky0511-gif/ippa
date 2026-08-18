// "Produtos similares" — mostrado no quick-view, na página cheia do
// produto (mesma âncora: o produto sendo visto) e no carrinho (várias
// âncoras: os produtos já escolhidos). Duas camadas, nessa ordem de
// prioridade:
// 1. Curadoria manual por produto/contexto (Product.similarProductIdsQuickview/
//    similarProductIdsCart, editável em /produtos) — quando presente,
//    substitui a regra automática pra aquela âncora, sem completar até o
//    limite (é intencional: a loja escolheu exatamente aquilo).
// 2. Regra automática configurada em /ferramentas (SimilarProductsSettings)
//    — um registro de regras (SIMILAR_PRODUCTS_RULES) combinadas por
//    interleave (round-robin), pra nenhuma regra sozinha engolir o limite
//    inteiro quando mais de uma está ativa. Adicionar uma regra nova é só
//    uma entrada nova no registro abaixo.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Product, SimilarProductsSettings, SimilarProductsRuleConfig } from './types';

type SimilarProductsContext = 'quickview' | 'cart';

interface RuleArgs {
  catalog: Product[];
  anchors: Product[];
  excludeIds: Set<string>;
  settings: SimilarProductsSettings;
}

type RuleFn = (args: RuleArgs) => Product[];

export const SIMILAR_PRODUCTS_RULES: Record<string, RuleFn> = {
  sameSubcategory: ({ catalog, anchors, excludeIds }) =>
    catalog.filter(
      (p) =>
        !excludeIds.has(p.id) &&
        anchors.some((a) => !!a.subcategory && p.category === a.category && p.subcategory === a.subcategory)
    ),
  sameCategory: ({ catalog, anchors, excludeIds }) =>
    catalog.filter((p) => !excludeIds.has(p.id) && anchors.some((a) => p.category === a.category)),
  complementaryCategory: ({ catalog, anchors, excludeIds, settings }) => {
    const wanted = new Set(anchors.flatMap((a) => settings.complementaryCategories?.[a.category] || []));
    return catalog.filter((p) => !excludeIds.has(p.id) && wanted.has(p.category));
  },
};

const OVERRIDE_FIELD: Record<SimilarProductsContext, 'similarProductIdsQuickview' | 'similarProductIdsCart'> = {
  quickview: 'similarProductIdsQuickview',
  cart: 'similarProductIdsCart',
};

// Round-robin entre as listas de cada regra ativa — garante que, com mais
// de uma regra, o resultado final tenha um pouco de cada uma em vez da
// primeira regra preencher o limite inteiro sozinha.
function interleave(lists: Product[][]): Product[] {
  const result: Product[] = [];
  const seen = new Set<string>();
  const maxLen = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < maxLen; i++) {
    for (const list of lists) {
      const p = list[i];
      if (p && !seen.has(p.id)) {
        seen.add(p.id);
        result.push(p);
      }
    }
  }
  return result;
}

export function computeSimilarProducts(
  context: SimilarProductsContext,
  anchors: Product[],
  catalog: Product[],
  settings: SimilarProductsSettings
): Product[] {
  const config: SimilarProductsRuleConfig = settings[context];
  const overrideField = OVERRIDE_FIELD[context];
  const anchorIds = new Set(anchors.map((a) => a.id));
  const catalogById = new Map(catalog.map((p) => [p.id, p]));

  const overridden = anchors.filter((a) => (a[overrideField]?.length || 0) > 0);
  const ruled = anchors.filter((a) => !(a[overrideField]?.length || 0));

  const manual: Product[] = [];
  const manualSeen = new Set<string>();
  for (const anchor of overridden) {
    for (const id of anchor[overrideField] || []) {
      if (anchorIds.has(id) || manualSeen.has(id)) continue;
      const p = catalogById.get(id);
      if (!p) continue;
      manualSeen.add(id);
      manual.push(p);
    }
  }

  const excludeIds = new Set([...anchorIds, ...manualSeen]);
  const ruleLists =
    ruled.length === 0
      ? []
      : config.rules
          .map((id) => SIMILAR_PRODUCTS_RULES[id])
          .filter((fn): fn is RuleFn => !!fn)
          .map((fn) => fn({ catalog, anchors: ruled, excludeIds, settings }));
  const ruleCandidates = interleave(ruleLists);

  const seen = new Set<string>();
  const combined = [...manual, ...ruleCandidates].filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  return combined.slice(0, config.limit);
}

export const DEFAULT_SIMILAR_PRODUCTS_SETTINGS: SimilarProductsSettings = {
  quickview: { limit: 3, rules: ['sameSubcategory', 'sameCategory'] },
  cart: { limit: 10, rules: ['sameSubcategory', 'complementaryCategory', 'sameCategory'] },
  complementaryCategories: {},
};

export async function getSimilarProductsSettings(): Promise<SimilarProductsSettings> {
  try {
    const raw = await readFile(path.join(process.cwd(), 'src/data/similarProductsSettings.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      quickview: parsed.quickview || DEFAULT_SIMILAR_PRODUCTS_SETTINGS.quickview,
      cart: parsed.cart || DEFAULT_SIMILAR_PRODUCTS_SETTINGS.cart,
      complementaryCategories: parsed.complementaryCategories || {},
    };
  } catch {
    return DEFAULT_SIMILAR_PRODUCTS_SETTINGS;
  }
}
