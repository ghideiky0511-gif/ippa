// Facetas derivadas do catálogo (categorias/cores/tamanhos), usadas tanto
// pela home (menu de categorias) quanto pelo catálogo (filtros).

import type { HomeSection, Product, ResolvedHomeSection } from './types';

export function getCategories(products: Product[]): string[] {
  return Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort();
}

export function getColors(products: Product[]): string[] {
  return Array.from(new Set(products.flatMap((p) => p.colors || []).filter(Boolean))).sort();
}

export function getSizes(products: Product[]): string[] {
  return Array.from(new Set(products.flatMap((p) => p.sizes || []).filter(Boolean))).sort((a, b) =>
    isNaN(Number(a)) || isNaN(Number(b)) ? a.localeCompare(b) : Number(a) - Number(b)
  );
}

// Resolve uma lista de IDs pra produtos, preservando a ordem da lista e
// ignorando IDs que não existem mais. `ids` null/undefined é a convenção
// pra "sem filtro" — retorna o catálogo inteiro (usado por públicos/tags
// que ainda não têm uma lista própria definida).
export function getProductsByIds(products: Product[], ids?: string[] | null): Product[] {
  if (!ids) return products;
  const byId = new Map(products.map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id)).filter((p): p is Product => Boolean(p));
}

// Resolve os sections da home (web/src/data/homeSections.json, editado pela
// plataforma admin) pros dados reais do catálogo. Sections `banner` passam
// direto (não têm produto pra resolver); sections `product` viram
// `{ ...section, product }` resolvendo o único `productId` do bloco (cada
// produto na home é seu próprio bloco arrastável, não uma grade fixa — ver
// admin/src/lib/blockRegistry.js).
export function resolveHomeSections(products: Product[], sections?: HomeSection[] | null): ResolvedHomeSection[] {
  return (sections || []).map((section): ResolvedHomeSection => {
    if (section.type !== 'product') return section;
    const [product] = getProductsByIds(products, [section.productId]);
    return { ...section, product };
  });
}
